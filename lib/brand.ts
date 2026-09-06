/**
 * MongoDB brand tokens for canvas-rendered surfaces (Recharts, React Flow) that
 * cannot read CSS custom properties. Values are taken from the MongoDB Brand Book.
 */
export const brand = {
  springGreen: '#00ED64',
  forestGreen: '#00684A',
  evergreen: '#023430',
  slateBlue: '#001E2B',
  mist: '#E3FCF7',
  azure: '#A6FFEC',
  chartreuse: '#B1FF05',
  purple: '#7C25FF',
  mauve: '#B45AF2',
  lilac: '#F2C5EE',
  clearBlue: '#006EFF',
  sky: '#00D2FF',
  chrome: '#FF9F10',
  yellow: '#FFC010',
} as const;

/** Chart chrome: grid, axes, tooltips. */
export const chartTheme = {
  grid: '#0E3547',
  axis: '#14465C',
  tick: '#7E9FAE',
  label: '#5C8698',
  tooltip: {
    background: '#00232F',
    border: '1px solid #14465C',
    borderRadius: 10,
    fontSize: 12,
    color: '#E3FCF7',
  },
} as const;

/**
 * Categorical series colours for dose groups, ordered so the control group reads
 * as neutral and increasing doses stay distinguishable in both hue and lightness.
 */
export const doseSeriesColors = [
  '#8FA9B4', // control — deliberately neutral
  brand.sky,
  brand.springGreen,
  brand.yellow,
  brand.mauve,
  brand.chartreuse,
] as const;

export function doseColor(index: number): string {
  return doseSeriesColors[index % doseSeriesColors.length];
}
