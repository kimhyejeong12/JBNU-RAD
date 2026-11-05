-- compose.yaml 의 PostgreSQL 이 처음 뜰 때 한 번 돕니다. 진짜 DB(sentinelai)는 POSTGRES_DB 가 만들고, 여기서는 시험용 둘을 만듭니다.
-- 시험 환경(make dev)과 DB 시험(make test)이 진짜 DB 를 건드리지 않게 따로 둡니다. 로캘은 진짜 DB 와 같게 C 입니다.
CREATE DATABASE sentinelai_dev TEMPLATE template0 ENCODING 'UTF8' LOCALE 'C';
CREATE DATABASE sentinelai_test TEMPLATE template0 ENCODING 'UTF8' LOCALE 'C';
