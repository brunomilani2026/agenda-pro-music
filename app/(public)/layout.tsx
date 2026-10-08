export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      {/* Header público será adicionado aqui */}
      <main>{children}</main>
    </div>
  );
}
