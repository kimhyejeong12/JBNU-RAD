// 화면 데이터를 못 받으면 작업 공간 자리에 이유를 띄웁니다.
export function LoadError({ message }: { message: string }) {
  return (
    <div className="workspace">
      <div className="card empty" style={{ gridColumn: "1 / -1" }}>서버에서 화면 데이터를 받지 못했습니다: {message}</div>
    </div>
  );
}
