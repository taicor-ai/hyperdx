import { z } from 'zod';
import { z as z4 } from 'zod/v4';

// Backport of https://github.com/colinhacks/zod/commit/a0ebf97 for Zod 3.
describe('Zod collection size guards', () => {
  it.each(['sync', 'async'])(
    'rejects oversized collections before parsing elements (%s)',
    async mode => {
      const parseElement = jest.fn(() => true);
      const refineCollection = jest.fn(() => true);
      const element = z.string().refine(parseElement);
      const input = ['a', 'b', 'c'];
      const schemas = [
        { schema: z.array(element).max(2).refine(refineCollection), input },
        { schema: z.array(element).length(2).refine(refineCollection), input },
        {
          schema: z.set(element).max(2).refine(refineCollection),
          input: new Set(input),
        },
      ];

      for (const { schema, input } of schemas) {
        const result =
          mode === 'async'
            ? await schema.safeParseAsync(input)
            : schema.safeParse(input);
        expect(result.success).toBe(false);
        expect(result.error?.issues).toHaveLength(1);
        expect(result.error?.issues[0]).toMatchObject({ code: 'too_big' });
      }
      expect(parseElement).not.toHaveBeenCalled();
      expect(refineCollection).not.toHaveBeenCalled();
    },
  );

  it('preserves valid values, transforms, and minimum-length errors', () => {
    const element = z.string().transform(value => value.toUpperCase());
    expect(z.array(element).max(2).parse(['a', 'b'])).toEqual(['A', 'B']);
    expect(z.array(element).length(2).parse(['a', 'b'])).toEqual(['A', 'B']);
    expect(
      z
        .set(element)
        .max(2)
        .parse(new Set(['a', 'b'])),
    ).toEqual(new Set(['A', 'B']));
    expect(
      z.array(element).length(2).safeParse(['a']).error?.issues[0],
    ).toMatchObject({ code: 'too_small' });
    expect(
      z.array(element).max(2).safeParse([1]).error?.issues[0],
    ).toMatchObject({ code: 'invalid_type' });
  });
});

describe('bundled Zod 4 collection size guards', () => {
  it.each(['sync', 'async'])(
    'rejects oversized collections before parsing elements (%s)',
    async mode => {
      const parseElement = jest.fn(() => true);
      const refineCollection = jest.fn(() => true);
      const element = z4.string().refine(parseElement);
      const input = ['a', 'b', 'c'];
      const schemas = [
        { schema: z4.array(element).max(2).refine(refineCollection), input },
        { schema: z4.array(element).length(2).refine(refineCollection), input },
        {
          schema: z4.set(element).max(2).refine(refineCollection),
          input: new Set(input),
        },
        {
          schema: z4
            .map(element, element)
            .check(z4.maxSize(2))
            .refine(refineCollection),
          input: new Map(input.map(value => [value, value])),
        },
      ];
      for (const { schema, input } of schemas) {
        const result =
          mode === 'async'
            ? await schema.safeParseAsync(input)
            : schema.safeParse(input);
        expect(result.success).toBe(false);
        expect(result.error?.issues).toHaveLength(1);
        expect(result.error?.issues[0]).toMatchObject({ code: 'too_big' });
      }
      expect(parseElement).not.toHaveBeenCalled();
      expect(refineCollection).not.toHaveBeenCalled();
    },
  );

  it('allows a leading overwrite to reduce the input before its size check', () => {
    expect(
      z4
        .array(z4.number())
        .overwrite(values => values.slice(0, 2))
        .max(2)
        .parse([1, 2, 3]),
    ).toEqual([1, 2]);
    expect(
      z4.array(z4.string()).max(2).safeParse(1).error?.issues[0],
    ).toMatchObject({ code: 'invalid_type' });
  });
});
