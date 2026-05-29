import Link from 'next/link';

export const metadata = { title: '개인정보처리방침 — 마트 숏츠 메이커' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
          ← 홈으로
        </Link>
        <h1 className="mt-2 text-3xl font-bold">개인정보처리방침</h1>
        <p className="mt-2 text-sm text-gray-500">시행일: 2026-05-29</p>
      </header>

      <section className="space-y-6 text-sm text-gray-700">
        <p>
          주식회사 인스로드(이하 “회사”)는 「개인정보 보호법」 등 관련 법령을
          준수하며, 이용자의 개인정보를 안전하게 보호하기 위해 다음과 같이
          개인정보처리방침을 수립·공개합니다.
        </p>

        <div>
          <h2 className="text-lg font-semibold">1. 수집하는 개인정보 항목</h2>
          <ul className="mt-2 list-disc pl-5">
            <li>
              <b>계정 식별 정보</b>: 관리자가 발급한 아이디(이메일 형태) ·
              비밀번호(해시 저장)
            </li>
            <li>
              <b>매장 정보</b>: 매장명 (영상 자동 생성에 사용)
            </li>
            <li>
              <b>이용자 생성 콘텐츠</b>: 업로드한 사진·영상·텍스트(스크립트
              초안 등)
            </li>
            <li>
              <b>자동 수집 정보</b>: 접속 로그, IP 주소, 브라우저·OS 정보,
              쿠키(세션 유지용)
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold">2. 수집·이용 목적</h2>
          <ul className="mt-2 list-disc pl-5">
            <li>회원 인증 및 서비스 접근 제어</li>
            <li>이용자별 작업 상태 저장 및 다른 기기 이어쓰기 제공</li>
            <li>AI 모델(텍스트·음성·이미지)에 입력값 전달 후 결과물 생성</li>
            <li>장애 대응, 부정 이용 방지, 보안 모니터링</li>
            <li>법령상 의무 이행</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold">3. 보유 및 이용 기간</h2>
          <ul className="mt-2 list-disc pl-5">
            <li>
              <b>계정 정보</b>: 계정 해지 시까지. 해지 요청 시 지체 없이 파기
              (법령 별도 보존 의무가 있는 경우 그 기간까지)
            </li>
            <li>
              <b>이용자 콘텐츠(사진·텍스트)</b>: 이용자가 직접 삭제하거나 계정
              해지 시까지
            </li>
            <li>
              <b>접속 로그</b>: 「통신비밀보호법」에 따라 최소 3개월
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold">4. 제3자 제공 및 처리 위탁</h2>
          <p className="mt-2">
            회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다.
            다만 서비스 제공을 위해 다음과 같이 처리 업무를 위탁합니다.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse border border-gray-200 text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border border-gray-200 px-2 py-1 text-left">
                    수탁사
                  </th>
                  <th className="border border-gray-200 px-2 py-1 text-left">
                    위탁 업무
                  </th>
                  <th className="border border-gray-200 px-2 py-1 text-left">
                    전송 정보
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-200 px-2 py-1">Supabase, Inc. (미국)</td>
                  <td className="border border-gray-200 px-2 py-1">
                    인증·DB·파일 호스팅
                  </td>
                  <td className="border border-gray-200 px-2 py-1">
                    계정 식별 정보, 이용자 콘텐츠
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-2 py-1">Vercel Inc. (미국)</td>
                  <td className="border border-gray-200 px-2 py-1">웹 서비스 호스팅</td>
                  <td className="border border-gray-200 px-2 py-1">
                    접속 로그, 세션 쿠키
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-2 py-1">
                    Google LLC (미국)
                  </td>
                  <td className="border border-gray-200 px-2 py-1">
                    음성 합성 (Text-to-Speech)
                  </td>
                  <td className="border border-gray-200 px-2 py-1">
                    스크립트 텍스트
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-2 py-1">
                    Anthropic PBC (미국)
                  </td>
                  <td className="border border-gray-200 px-2 py-1">
                    AI 스크립트 생성
                  </td>
                  <td className="border border-gray-200 px-2 py-1">
                    업로드 사진(분석), 매장명
                  </td>
                </tr>
                <tr>
                  <td className="border border-gray-200 px-2 py-1">
                    Google Cloud (Cloud Run, 서울 리전)
                  </td>
                  <td className="border border-gray-200 px-2 py-1">
                    영상 렌더링 서버
                  </td>
                  <td className="border border-gray-200 px-2 py-1">
                    사진·음성·텍스트 (렌더링 동안 임시 보관)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            국외 이전: 위 일부 수탁사는 미국 등 국외에 서버를 두고 있으며,
            이용자의 본 개인정보처리방침 동의로 국외 이전에 동의한 것으로
            간주됩니다.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">5. 이용자의 권리</h2>
          <p className="mt-2">
            이용자는 언제든지 자신의 개인정보에 대해 열람·정정·삭제·처리정지를
            요청할 수 있습니다. 요청은 아래 연락처로 보내주세요. 회사는
            요청일로부터 10일 이내에 처리합니다.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">6. 안전성 확보 조치</h2>
          <ul className="mt-2 list-disc pl-5">
            <li>비밀번호 해시 저장 (평문 미보관)</li>
            <li>HTTPS 전송 암호화</li>
            <li>Row Level Security (RLS) 로 사용자별 데이터 격리</li>
            <li>접근 권한 분리: 관리자/일반 사용자 권한 분리</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold">7. 쿠키</h2>
          <p className="mt-2">
            회사는 세션 유지에 필요한 쿠키를 사용합니다. 이용자는 브라우저
            설정으로 쿠키를 거부할 수 있으나, 일부 기능 이용이 제한될 수
            있습니다.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">8. 개인정보 보호 책임자</h2>
          <p className="mt-2">
            성명: 김경애
            <br />
            소속: 주식회사 인스로드
            <br />
            이메일: kka@ginie.kr
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold">9. 변경 고지</h2>
          <p className="mt-2">
            본 방침은 법령·서비스 변경에 따라 갱신될 수 있으며, 변경 시
            서비스 내 공지로 안내합니다.
          </p>
        </div>
      </section>
    </main>
  );
}
