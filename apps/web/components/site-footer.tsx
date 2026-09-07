export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-hairline">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-[12px] text-ink-600 sm:flex-row sm:items-center sm:justify-between">
        <p>Uploads are deleted after each run. Only hashes are stored on-chain.</p>
        <p>Image-level provenance, not identity search.</p>
      </div>
    </footer>
  );
}
