/**
 * (public) layout — wraps /courts and /for-courts.
 * No auth required. Provides the public-root CSS class and font.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return (
      <div className="public-root" style={{ fontFamily: "'Poppins','Plus Jakarta Sans',sans-serif" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');`}</style>
        {children}
      </div>
    );
  }