/** Restrictions a lesson can switch on (e.g. "beatmatch by ear": no BPM numbers, no SYNC). */
export const rules = { noSync: false, hideBpm: false, hideWaves: false };

export function setRules(r: Partial<typeof rules>): void {
  Object.assign(rules, r);
  document.body.classList.toggle('acad-nobpm', rules.hideBpm);
  document.body.classList.toggle('acad-nowave', rules.hideWaves);
}
