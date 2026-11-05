-- 시험 환경 · DB 시험용 DB 를 진짜 DB 와 따로 만듭니다 (compose 첫 기동 때 한 번).
CREATE DATABASE sentinelai_dev TEMPLATE template0 ENCODING 'UTF8' LOCALE 'C';
CREATE DATABASE sentinelai_test TEMPLATE template0 ENCODING 'UTF8' LOCALE 'C';
