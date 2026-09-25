import {WindscribeCli} from './cli.js';
import {parseStatus, parseLocations} from './parser.js';

const cli = new WindscribeCli();

const status = await cli.run(['status']);
const parsed = parseStatus(status.stdout);
console.log('status:', parsed.connected ? 'connected' : 'disconnected');

const locations = await cli.run(['locations']);
const list = parseLocations(locations.stdout);
console.log(`locations: ${list.locations.length}, best: ${list.best ? 'yes' : 'no'}`);

console.log('live cli OK');
