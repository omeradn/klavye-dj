/** RESTORAN MODU panel: automix on/off, lock, quiet, volume ceiling, what plays next. */
import { $, setText } from '../util';
import { Knob } from './controls';
import { rest, restStatus, setLock, setQuiet, setRestaurant, setUserCap } from '../restaurant/automix';

export function setupRestaurantPanel(): void {
  const cap = new Knob($('#restCapK'), { min: 0.3, max: 1, def: rest.userCap, label: 'TAVAN', onchange: setUserCap });
  cap.set(rest.userCap);
  $('#restOn').onclick = () => setRestaurant(!rest.on);
  $('#restLock').onclick = () => setLock(!rest.lock);
  $('#restQuiet').onclick = () => setQuiet(!rest.quiet);
  rest.listeners.push(() => {
    setText($('#restStatus'), restStatus());
    $('#restOn').classList.toggle('on', rest.on);
    $('#restLock').classList.toggle('on', rest.lock);
    $('#restQuiet').classList.toggle('on', rest.quiet);
    $('#restQuiet').classList.toggle('red', rest.quiet);
  });
}
