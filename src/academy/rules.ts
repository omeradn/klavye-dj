/** Restrictions a lesson can switch on (e.g. "beatmatch by ear": no BPM numbers, no SYNC). */
export const rules = { noSync: false, hideBpm: false };

export function setRules(r: Partial<typeof rules>): void {
  Object.assign(rules, r);
  document.body.classList.toggle('acad-nobpm', rules.hideBpm);
}
