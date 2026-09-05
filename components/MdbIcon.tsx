/**
 * Official MongoDB product icons, used only where a MongoDB *concept* is being
 * illustrated (architecture planes, retrieval lanes). Interactive chrome keeps
 * using Lucide, which is a UI icon set and can inherit `currentColor`.
 *
 * The brand assets ship as PNG with a separate light/dark artwork pair, so both
 * are rendered and CSS reveals the one matching the active theme. That keeps the
 * switch working for `data-theme` *and* the `prefers-color-scheme` fallback
 * without a hydration-time flash.
 *
 * Source: MongoDB Brand Book icon library.
 */
export type MdbIconName =
  | 'aggregation-pipelines'
  | 'vector-search'
  | 'full-text-search'
  | 'hybrid-search'
  | 'change-streams'
  | 'document-model'
  | 'data-modeling'
  | 'audit'
  | 'ai'
  | 'index'
  | 'pharmaceuticals'
  | 'hipaa-compliance'
  | 'queryable-snapshot'
  | 'insight'
  | 'real-time'
  | 'data-analytics'
  | 'schema-visualization'
  | 'security'
  | 'atlas-charts';

export default function MdbIcon({ name, size = 40, title }: { name: MdbIconName; size?: number; title?: string }) {
  return (
    <span className="mdb-icon" style={{ width: size, height: size }} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brand/icons/${name}-inverse.png`} alt="" width={size} height={size} data-variant="dark" loading="lazy" decoding="async" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/brand/icons/${name}.png`} alt="" width={size} height={size} data-variant="light" loading="lazy" decoding="async" />
    </span>
  );
}
