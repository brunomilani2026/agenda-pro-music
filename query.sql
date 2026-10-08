-- Assumindo que data_efet vem no formato DD/MM/AAAA (ex: 31/07/2025)
WITH base_producao AS (
SELECT
dependencia AS cd_agencia,
EXTRACT(MONTH FROM TO_TIMESTAMP(data_efet, 'dd/MM/yyyy')) AS mes,
valor_producao
FROM exp_gecan.vw_credito_gerentes
WHERE dependencia IN (144, 141, 104)
AND cd_produto = 1
AND EXTRACT(YEAR FROM TO_TIMESTAMP(data_efet, 'dd/MM/yyyy')) = 2025
)
SELECT
cd_agencia,
mes,
SUM(valor_producao) AS total_producao
FROM base_producao
GROUP BY cd_agencia, mes
ORDER BY cd_agencia, mes;
