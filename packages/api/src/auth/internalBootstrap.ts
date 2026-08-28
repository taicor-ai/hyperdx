import { randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

import * as config from '@/config';
import BootstrapState from '@/models/bootstrapState';
import Team from '@/models/team';
import User from '@/models/user';
import { setupTeamDefaults } from '@/setupDefaults';

export type BootstrapStatus = 'uninitialized' | 'ready' | 'inconsistent';

async function expectedIdentityStatus(): Promise<{
  status: BootstrapStatus;
  teamId?: string;
}> {
  const [teams, users] = await Promise.all([
    Team.find({}).limit(2),
    User.find({}).select('email team').limit(1000),
  ]);
  if (teams.length === 0 && users.length === 0)
    return { status: 'uninitialized' };
  if (teams.length !== 1 || !teams[0]) return { status: 'inconsistent' };
  const expected = users.filter(
    user => user.email === config.INTERNAL_BOOTSTRAP_EMAIL.toLowerCase(),
  );
  if (expected.length === 1 && expected[0]?.team?.equals(teams[0]._id)) {
    return { status: 'ready', teamId: teams[0]._id.toString() };
  }
  if (users.length === 0) {
    return { status: 'uninitialized', teamId: teams[0]._id.toString() };
  }
  return { status: 'inconsistent' };
}

async function tokenMatches(
  authorization: string | undefined,
): Promise<boolean> {
  if (!authorization?.startsWith('Bearer ')) return false;
  const presented = Buffer.from(authorization.slice('Bearer '.length));
  // The path comes from startup-validated operator configuration and is not
  // derived from any request value.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const expectedValue = await readFile(
    config.INTERNAL_BOOTSTRAP_TOKEN_FILE,
    'utf8',
  );
  const expected = Buffer.from(expectedValue.trim());
  return (
    presented.length === expected.length && timingSafeEqual(presented, expected)
  );
}

export async function requireInternalBootstrapToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!config.INTERNAL_BOOTSTRAP_ENABLED) return res.sendStatus(404);
  try {
    if (!(await tokenMatches(req.header('authorization')))) {
      return res.sendStatus(401);
    }
    next();
  } catch (error) {
    next(error);
  }
}

export async function getBootstrapStatus(_req: Request, res: Response) {
  const { status } = await expectedIdentityStatus();
  res.json({ status });
}

async function acquireLease(owner: string): Promise<boolean> {
  try {
    const lease = await BootstrapState.findOneAndUpdate(
      {
        _id: 'clickstack',
        $or: [
          { leaseExpiresAt: { $lt: new Date() } },
          { leaseExpiresAt: { $exists: false } },
        ],
      },
      {
        $set: {
          owner,
          status: 'initializing',
          leaseExpiresAt: new Date(Date.now() + 120_000),
        },
      },
      { upsert: true, new: true },
    );
    return lease?.owner === owner;
  } catch (error) {
    if (
      error instanceof mongoose.mongo.MongoServerError &&
      error.code === 11000
    ) {
      return false;
    }
    throw error;
  }
}

export async function runInternalBootstrap(_req: Request, res: Response) {
  const before = await expectedIdentityStatus();
  if (before.status === 'inconsistent') {
    return res.status(409).json({ status: before.status });
  }

  const owner = randomUUID();
  if (!(await acquireLease(owner))) {
    return res.status(409).json({ status: 'initializing' });
  }
  try {
    let current = await expectedIdentityStatus();
    if (current.status === 'inconsistent') {
      return res.status(409).json({ status: current.status });
    }
    if (current.status === 'ready' && current.teamId) {
      await setupTeamDefaults(current.teamId);
      await BootstrapState.updateOne(
        { _id: 'clickstack', owner },
        {
          $set: { status: 'ready', leaseExpiresAt: new Date(0) },
          $unset: { owner: 1 },
        },
      );
      return res.json({ status: 'ready' });
    }
    let team = current.teamId ? await Team.findById(current.teamId) : null;
    team ??= await new Team({
      name: config.INTERNAL_BOOTSTRAP_TEAM,
      collectorAuthenticationEnforced: true,
    }).save();
    const existing = await User.findOne({
      email: config.INTERNAL_BOOTSTRAP_EMAIL.toLowerCase(),
    });
    if (!existing) {
      await new User({
        email: config.INTERNAL_BOOTSTRAP_EMAIL.toLowerCase(),
        name: 'ClickStack bootstrap',
        team: team._id,
      }).save();
    } else if (!existing.team?.equals(team._id)) {
      return res.status(409).json({ status: 'inconsistent' });
    }
    await setupTeamDefaults(team._id.toString());
    current = await expectedIdentityStatus();
    if (current.status !== 'ready') {
      return res.status(409).json({ status: current.status });
    }
    await BootstrapState.updateOne(
      { _id: 'clickstack', owner },
      {
        $set: { status: 'ready', leaseExpiresAt: new Date(0) },
        $unset: { owner: 1 },
      },
    );
    return res.json({ status: 'ready' });
  } finally {
    await BootstrapState.updateOne(
      { _id: 'clickstack', owner, status: { $ne: 'ready' } },
      { $set: { leaseExpiresAt: new Date(0) } },
    );
  }
}
