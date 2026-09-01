export function findingsFrom(results, keys) {
  return keys.flatMap((key) => Array.isArray(results[key]?.output?.findings) ? results[key].output.findings : []);
}

export function adjudicate(results, keys) {
  const findings = findingsFrom(results, keys);
  const blocking = findings.filter((item) => ['P0', 'P1'].includes(item?.severity));
  const failed = keys.filter((key) => results[key]?.output?.verdict !== 'PASS');
  return {
    verdict: blocking.length || failed.length ? 'FIX_BODY' : 'PASS',
    findings,
    blocking_findings: blocking,
    failed_roles: failed,
  };
}

export function latestResult(results, prefix) {
  return results[`${prefix}-3`] ?? results[`${prefix}-2`] ?? results[`${prefix}-1`];
}
