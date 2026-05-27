import { AuthHeader } from './AuthHeader';

export default function VideoMakerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <AuthHeader />
      </div>
      {children}
    </>
  );
}
