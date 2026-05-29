export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <a href="#" className="text-lg font-bold tracking-tight text-brand">
            COMPANY
          </a>
          <nav className="hidden gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#about" className="hover:text-brand">회사 소개</a>
            <a href="#services" className="hover:text-brand">서비스</a>
            <a href="#contact" className="hover:text-brand">문의</a>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-24 md:py-32">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-brand-accent">
          Welcome
        </p>
        <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight text-brand md:text-6xl">
          더 나은 내일을 만드는<br />
          기술과 서비스
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-600">
          저희는 고객의 문제를 깊이 이해하고, 본질에 집중한 솔루션을
          제공합니다. 작은 아이디어부터 큰 변화까지 함께 만들어 갑니다.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <a
            href="#contact"
            className="rounded-md bg-brand px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            문의하기
          </a>
          <a
            href="#services"
            className="rounded-md border border-slate-300 px-6 py-3 text-sm font-semibold text-brand hover:bg-slate-50"
          >
            서비스 보기
          </a>
        </div>
      </section>

      <section id="about" className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-bold text-brand">회사 소개</h2>
          <p className="mt-4 max-w-3xl text-slate-600">
            여기에 회사 비전, 미션, 팀 소개 등 핵심 메시지를 적어주세요.
          </p>
        </div>
      </section>

      <section id="services" className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-bold text-brand">서비스</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { title: "서비스 1", desc: "핵심 가치를 짧게 설명합니다." },
              { title: "서비스 2", desc: "핵심 가치를 짧게 설명합니다." },
              { title: "서비스 3", desc: "핵심 가치를 짧게 설명합니다." },
            ].map((s) => (
              <div
                key={s.title}
                className="rounded-lg border border-slate-200 p-6 transition hover:border-brand-accent hover:shadow-sm"
              >
                <h3 className="text-lg font-semibold text-brand">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-bold text-brand">문의</h2>
          <p className="mt-4 text-slate-600">
            이메일:{" "}
            <a
              href="mailto:hello@example.com"
              className="font-medium text-brand-accent hover:underline"
            >
              hello@example.com
            </a>
          </p>
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-slate-500">
          © {new Date().getFullYear()} Company. All rights reserved.
        </div>
      </footer>
    </main>
  );
}
