export type IconName =
  | 'branch'
  | 'changes'
  | 'pr'
  | 'commit'
  | 'push'
  | 'close'
  | 'refresh'
  | 'chevron'
  | 'github'
  | 'files'

export function Icon({ name }: { name: IconName }) {
  // GitHub mark: https://github.com/primer/octicons (MIT; docs/OCTICONS-LICENSE.txt).
  if (name === 'github') {
    return (
      <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656" />
      </svg>
    )
  }

  const paths = {
    branch: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="18" cy="5" r="2" />
        <circle cx="6" cy="19" r="2" />
        <path d="M6 7v10M18 7c0 6-12 3-12 9" />
      </>
    ),
    changes: (
      <>
        <rect x="5" y="3" width="14" height="18" rx="3" />
        <path d="M9 9h6m-3-3v6m-3 4h6" />
      </>
    ),
    pr: (
      <>
        <circle cx="6" cy="5" r="2" />
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="19" r="2" />
        <path d="M6 7v10m6-14 3 3-3 3m3-3c3 0 3 4 3 6v5" />
      </>
    ),
    commit: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M2 12h6m8 0h6" />
      </>
    ),
    push: (
      <>
        <path d="m8 10 4-4 4 4m-4-4v15M6 16H5a4 4 0 0 1-1-8 8 8 0 0 1 15 0 4 4 0 0 1 0 8h-1" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5m11-1A8 8 0 0 0 6 6m-2 7a8 8 0 0 0 14 5" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
    files: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Zm3-2V3h6l2 2h5" />,
  }

  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
