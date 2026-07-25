const FIELDS = [
  ['Campaign', 'meta_campaign_id'],
  ['Ad set', 'meta_adset_id'],
  ['Ad', 'meta_ad_id'],
  ['Form', 'meta_form_id'],
  ['Meta lead ID', 'meta_lead_id'],
]

export function MetaAttribution({ lead }) {
  if (lead?.source !== 'meta_lead_ads' && !lead?.meta_lead_id) return null

  return (
    <section className="rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Meta attribution">
      <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800">
        Meta Lead Ads
      </span>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([label, key]) => (
          <div key={key}>
            <dt className="text-xs font-medium text-slate-500">{label}</dt>
            <dd className="break-all text-sm text-slate-900">{lead[key] || 'Not available'}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
