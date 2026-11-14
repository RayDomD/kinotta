import { expect, it } from 'vitest';
import { gradeFilters } from '../../server/core/_internal/grade.ts';

it('omits default grade filters', () => {
  expect(gradeFilters()).toBe('');
  expect(gradeFilters({ exposure: 0, temperature: 6500, contrast: 1, saturation: 1, shadowsColor: [0, 0, 0] })).toBe('');
});

it.each([
  [{ exposure: 1 }, 'exposure=exposure=1'],
  [{ temperature: 4000 }, 'colortemperature=temperature=4000'],
  [{ tint: 0.2 }, 'colorbalance=rm=0.1:gm=-0.2:bm=0.1'],
  [{ contrast: 1.2 }, 'eq=contrast=1.2'],
  [{ saturation: 0.5 }, 'eq=saturation=0.5'],
  [{ blacks: 0.1 }, 'colorlevels=romin=0.1:gomin=0.1:bomin=0.1'],
  [{ blacks: -0.1 }, 'colorlevels=rimin=0.1:gimin=0.1:bimin=0.1'],
  [{ mids: 0.5 }, 'eq=gamma=1.414'],
  [{ whites: 0.2 }, 'colorlevels=rimax=0.8:gimax=0.8:bimax=0.8'],
  [{ whites: -0.2 }, 'colorlevels=romax=0.8:gomax=0.8:bomax=0.8'],
  [{ shadowsColor: [0.1, -0.2, 0.3] }, 'colorbalance=rs=0.1:gs=-0.2:bs=0.3'],
  [{ midtonesColor: [0.1, -0.2, 0.3] }, 'colorbalance=rm=0.1:gm=-0.2:bm=0.3'],
  [{ highlightsColor: [0.1, -0.2, 0.3] }, 'colorbalance=rh=0.1:gh=-0.2:bh=0.3'],
] as Array<[import('../../server/core/_internal/grade.ts').Grade, string]>)('builds grade %j', (grade, expected) => {
  expect(gradeFilters(grade)).toBe(expected);
});

it('orders every grade filter and adds tint to midtones', () => {
  expect(gradeFilters({ exposure: 1, temperature: 4000, tint: 0.2, contrast: 1.2, saturation: 0.5, blacks: -0.1, mids: 0.5, whites: -0.2, shadowsColor: [0.1, 0.2, 0.3], midtonesColor: [0.2, 0.3, 0.4], highlightsColor: [0.3, 0.4, 0.5] })).toBe('exposure=exposure=1,colortemperature=temperature=4000,colorlevels=rimin=0.1:gimin=0.1:bimin=0.1:romax=0.8:gomax=0.8:bomax=0.8,eq=contrast=1.2:saturation=0.5:gamma=1.414,colorbalance=rs=0.1:gs=0.2:bs=0.3:rm=0.3:gm=0.1:bm=0.5:rh=0.3:gh=0.4:bh=0.5');
});

it('rounds grade filter values to three decimals and bounds combined tint', () => {
  expect(gradeFilters({ exposure: 0.123456, temperature: 4000.123456, midtonesColor: [1, -1, 0], tint: 0.3 })).toBe('exposure=exposure=0.123,colortemperature=temperature=4000.123,colorbalance=rm=1:gm=-1:bm=0.15');
});
