const KEY_PREFIX_PATTERN = /^([a-z0-9_]+)=(.*)$/i;

/**
 * Converte as linhas cruas do relatório do GAM em registros simples.
 *
 * O relatório vem com a dimensão de chave-valor no formato
 * `utm_campaign=black-friday`, e as métricas na ordem
 * impressões / eCPM / receita.
 */
export function parseGamRows(rows, expectedKey = "utm_campaign") {
  const result = [];

  for (const row of rows || []) {
    const rawKeyValue = row.dimensionValues?.[0]?.stringValue;
    if (!rawKeyValue) continue;

    const match = KEY_PREFIX_PATTERN.exec(rawKeyValue.trim());
    if (!match) continue;

    const [, key, value] = match;
    if (key.toLowerCase() !== expectedKey.toLowerCase()) continue;
    if (!value) continue;

    const values = row.metricValueGroups?.[0]?.primaryValues || [];

    result.push({
      key: key.toLowerCase(),
      value,
      impressions: Number(values[0]?.intValue || 0),
      ecpm: Number(values[1]?.doubleValue || 0),
      revenue: Number(values[2]?.doubleValue || 0),
    });
  }

  return result;
}
