import { describe, it, expect, beforeAll } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { color, px, ref, rem } from '../../src/tokens';
import { typography, variant } from '../../src/functions/non-color/typography';
import {
  bestContrastWith, closest, furthestFrom, largest, lighten, minContrastWith, nextLarger, smallest,
} from '../../src/functions';
import { FunctionError } from '../../src/errors';
import { parseTokenInput } from '../../site/editor/editor-input-parser';
import { loadEditorModule } from '../editor/load-editor';

/** Three text styles whose sizes and weights run in opposite directions. */
function book() {
  const b = new DesignBook('t');
  const type = b.addScope('type');
  type.set('body', typography({ fontSize: rem(1), fontWeight: 400, lineHeight: 1.5 }));
  type.set('caption', typography({ fontSize: rem(0.75), fontWeight: 700, lineHeight: 1.3 }));
  type.set('display', typography({ fontSize: rem(3), fontWeight: 300, lineHeight: 1.1 }));
  type.set('label', typography({ fontSize: rem(0.875), lineHeight: 1.2 })); // no weight
  return { b, type, ui: b.addScope('ui') };
}
const pick = (b: DesignBook, key: string) => b.inspect(key)?.picked;

describe('by: the field a text style is compared by', () => {
  it('font size unless told otherwise', () => {
    const { b, ui } = book();
    ui.set('big', largest(ref('type')));
    expect(pick(b, 'ui.big')).toBe('type.display');
  });

  it('largest / smallest by another field', () => {
    const { b, ui } = book();
    ui.set('heavy', largest(ref('type'), { by: 'fontWeight' }));
    ui.set('light', smallest(ref('type'), { by: 'fontWeight' }));
    ui.set('tight', smallest(ref('type'), { by: 'lineHeight' }));
    expect(pick(b, 'ui.heavy')).toBe('type.caption');
    expect(pick(b, 'ui.light')).toBe('type.display');
    expect(pick(b, 'ui.tight')).toBe('type.display');
  });

  it('a style without the field is no candidate', () => {
    const { b, ui } = book();
    ui.set('x', closest(ref('type.label'), ref('type'), { by: 'fontWeight' }));
    expect(() => b.resolve('ui.x')).toThrow(FunctionError);
  });

  it('closest, its aliases and furthestFrom measure the target by it too', () => {
    const { b, ui } = book();
    ui.set('near', closest(ref('type.body'), ref('type'), { by: 'fontWeight', not: [ref('type.body')] }));
    ui.set('heavier', nextLarger(ref('type.body'), ref('type'), { by: 'fontWeight' }));
    ui.set('far', furthestFrom(ref('type.body'), ref('type'), { by: 'fontWeight' }));
    expect(pick(b, 'ui.near')).toBe('type.display'); // 300 is nearer 400 than 700
    expect(pick(b, 'ui.heavier')).toBe('type.caption');
    expect(pick(b, 'ui.far')).toBe('type.caption');
  });

  it('the contrast pair compares the ratio of the field', () => {
    const { b, ui } = book();
    ui.set('most', bestContrastWith(ref('type.body'), ref('type'), { by: 'lineHeight' }));
    ui.set('enough', minContrastWith(ref('type.body'), ref('type'), { by: 'lineHeight', minContrast: 1.2 }));
    expect(pick(b, 'ui.most')).toBe('type.display'); // 1.5 / 1.1
    expect(pick(b, 'ui.enough')).toBe('type.label'); // 1.5 / 1.2 = 1.25, the least that reaches 1.2
  });

  it('reads inherited fields of a variant', () => {
    const { b, type, ui } = book();
    type.set('lead', variant(ref('type.body'), { fontSize: rem(1.25) })); // weight 400 from body
    ui.set('x', closest(ref('type.lead'), ref('type'), { by: 'fontWeight', not: [ref('type.lead')] }));
    expect(pick(b, 'ui.x')).toBe('type.body');
  });

  it('sizes are measured as themselves', () => {
    const b = new DesignBook('t');
    const s = b.addScope('space');
    s.set('s', px(4));
    s.set('l', px(16));
    b.addScope('ui').set('x', largest(ref('space'), { by: 'fontWeight' }));
    expect(b.resolve('ui.x')).toBe('16px');
  });

  it('is checked when written', () => {
    expect(() => largest(ref('type'), { by: 'font weight' })).toThrow(/`by` names a text style's field/);
    expect(() => largest(ref('type'), { by: 3 as never })).toThrow(FunctionError);
  });
});

describe('sorting text styles: field', () => {
  it('by font size unless told otherwise, and the warning is gone', () => {
    const { type } = book();
    type.setOrder([{ by: 'value' }]);
    expect(type.getAllKeys()).toEqual(['caption', 'label', 'body', 'display']);
  });

  it('by another field; styles without it keep their place after', () => {
    const { type } = book();
    type.setOrder([{ by: 'value', field: 'fontWeight', direction: 'desc' }]);
    expect(type.getAllKeys().slice(0, 3)).toEqual(['caption', 'body', 'display']);
  });

  it('follows a change to the field', () => {
    const { type } = book();
    type.setOrder([{ by: 'value', field: 'lineHeight' }]);
    expect(type.getAllKeys()[0]).toBe('display');
    type.set('display', typography({ fontSize: rem(3), fontWeight: 300, lineHeight: 1.6 }));
    expect(type.getAllKeys().at(-1)).toBe('display');
  });
});

describe('a text style handed to a color transform', () => {
  it('says which field to pass instead', () => {
    const b = new DesignBook('t');
    b.addScope('type').set('title', typography({ fontSize: rem(2), color: color('#336699') }));
    const ui = b.addScope('ui');
    ui.set('x', lighten(ref('type.title')));
    expect(() => b.resolve('ui.x')).toThrow(`lighten: "type.title" is a text style; pass one of its fields, e.g. ref('type.title.color')`);
    ui.set('y', lighten(ref('type.title.color')));
    expect(b.resolve('ui.y')).toMatch(/^#/);
  });
});

describe('by in the editor', () => {
  let getTokenDisplayValue: (scope: unknown, key: string) => string;
  beforeAll(async () => {
    ({ getTokenDisplayValue } = await loadEditorModule());
  });

  it('round-trips', () => {
    const { b, ui } = book();
    const written = "largest(ref('type'), { by: \"fontWeight\" })";
    ui.set('x', parseTokenInput(written, b, ui));
    expect(getTokenDisplayValue(ui, 'x')).toBe(written);
    expect(pick(b, 'ui.x')).toBe('type.caption');
  });
});
