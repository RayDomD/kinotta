/** A dashed empty state with dot terrain. */
export function Empty({ children }: { children: string }) {
  return (
    <div className="empty" role="status">
      {children}
      <div className="terrain" aria-hidden="true" />
    </div>
  );
}
