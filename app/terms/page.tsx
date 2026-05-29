import Link from 'next/link';

export const metadata = { title: '이용약관 — 숏츠 메이커' };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
          ← 홈으로
        </Link>
        <h1 className="mt-2 text-3xl font-bold">이용약관</h1>
        <p className="mt-2 text-sm text-gray-500">시행일: 2026-05-29</p>
      </header>

      <section className="prose prose-sm max-w-none space-y-6 text-gray-700">
        <div>
          <h2 className="text-lg font-semibold">제1조 (목적)</h2>
          <p>
            이 약관은 주식회사 인스로드(이하 “회사”)가 운영하는 “숏츠
            메이커”(이하 “서비스”)의 이용 조건 및 절차, 회사와 이용자의 권리·
            의무 및 책임사항을 규정함을 목적으로 합니다.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">제2조 (서비스 내용)</h2>
          <p>
            서비스는 이용자가 업로드한 매장 사진·텍스트를 기반으로 AI 모델을
            활용해 유튜브 숏츠 등 9:16 영상을 자동 생성하는 도구를 제공합니다.
            구체 기능은 회사 정책에 따라 변경될 수 있습니다.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">제3조 (계정)</h2>
          <ol className="list-decimal pl-5">
            <li>
              서비스 이용을 위한 계정은 회사가 발급한 아이디와 비밀번호로
              로그인합니다.
            </li>
            <li>
              이용자는 자신의 아이디와 비밀번호를 안전하게 관리할 책임이
              있으며, 제3자에게 양도하거나 공유할 수 없습니다.
            </li>
            <li>
              계정이 도용·유출된 경우 즉시 회사에 통지해야 하며, 통지 지연으로
              발생한 손해에 대해 회사는 책임지지 않습니다.
            </li>
          </ol>
        </div>

        <div>
          <h2 className="text-lg font-semibold">제4조 (이용자의 의무)</h2>
          <ol className="list-decimal pl-5">
            <li>
              이용자는 본인이 권리를 보유한 사진·영상·텍스트만 업로드해야
              합니다. 타인의 저작권·초상권·상표권 등을 침해하는 콘텐츠를
              업로드하는 행위는 금지됩니다.
            </li>
            <li>
              서비스로 생성한 결과물을 위법한 용도(허위·과장 광고, 명예훼손
              등)로 사용해서는 안 됩니다.
            </li>
            <li>
              자동화 도구로 비정상적인 요청을 보내거나 서비스 인프라를 우회·
              과부하시키는 행위는 금지됩니다.
            </li>
          </ol>
        </div>

        <div>
          <h2 className="text-lg font-semibold">제5조 (콘텐츠 권리)</h2>
          <ol className="list-decimal pl-5">
            <li>
              이용자가 업로드한 사진·텍스트의 저작권은 이용자에게 있으며, 회사는
              서비스 제공·운영을 위한 범위 내에서만 이를 처리합니다.
            </li>
            <li>
              서비스로 생성된 결과물의 이용 권한은 이용자에게 귀속됩니다. 다만
              내장된 음원·폰트·AI 모델 사용 시 해당 제공자의 라이선스를
              준수해야 합니다.
            </li>
          </ol>
        </div>

        <div>
          <h2 className="text-lg font-semibold">제6조 (서비스 변경 및 중단)</h2>
          <p>
            회사는 운영상·기술상 필요에 따라 서비스 내용을 변경하거나 일시
            중단할 수 있으며, 이로 인한 통상적인 손해에 대해 책임지지 않습니다.
            중요 변경은 사전 공지합니다.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">제7조 (계정 해지)</h2>
          <p>
            이용자는 언제든 회사에 계정 해지를 요청할 수 있으며, 회사는 해지
            요청 시 합리적인 기간 내에 계정·데이터를 삭제합니다. 회사는 이용자가
            본 약관을 위반한 경우 사전 통지 후 계정을 정지·해지할 수 있습니다.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">제8조 (면책)</h2>
          <ol className="list-decimal pl-5">
            <li>
              회사는 천재지변, 통신장애, 제3자(클라우드·AI 모델 제공자 등)의
              서비스 장애로 인한 손해에 대해 책임지지 않습니다.
            </li>
            <li>
              AI가 생성한 결과물의 정확성·적합성에 대해 회사는 보증하지 않으며,
              최종 사용 책임은 이용자에게 있습니다.
            </li>
          </ol>
        </div>

        <div>
          <h2 className="text-lg font-semibold">제9조 (준거법)</h2>
          <p>
            이 약관은 대한민국 법률에 따라 해석되며, 분쟁 발생 시 회사의
            본점 소재지 관할 법원을 합의 관할로 합니다.
          </p>
        </div>

        <div className="mt-8 rounded-md border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
          본 약관은 서비스 상용화 단계에서 회사 정책에 따라 갱신될 수 있으며,
          변경 시 서비스 내 공지로 안내합니다.
        </div>
      </section>
    </main>
  );
}
