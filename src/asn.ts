import * as crypto from 'crypto';
import * as fs from 'fs';
import maxmind, { AsnResponse, CityResponse, Reader } from 'maxmind';
import * as path from 'path';
import Pino from 'pino';
import * as stream from 'stream';
import * as tmp from 'tmp-promise';
import * as util from 'util';
import * as zlib from 'zlib';

import config from './config';
const pipeline = util.promisify(stream.pipeline);

let asnDatabase:Reader<AsnResponse>|null = null;
let cityDatabase:Reader<CityResponse>|null = null;

async function expandFile(fileName:string, key:Buffer, iv:Buffer):Promise<string> {
    const retVal = await tmp.tmpName({ postfix: '.mmdb'});
    var r = fs.createReadStream(fileName);

    var decrypt = crypto.createDecipheriv('aes-256-ctr', key, iv)
    var unzip = zlib.createGunzip();
    var w = fs.createWriteStream(retVal);


    await pipeline(r, decrypt, unzip, w);

    return retVal;
}

async function initialize(logger:Pino.Logger) {
    let asnFileName = path.join(__dirname, '..', './data/maxmind/GeoLite2-ASN.mmdb');
    let cityFileName = path.join(__dirname, '..', './data/maxmind/GeoLite2-City.mmdb');
    try {

        const keyHex = config.get('mmdbKey');
        const ivHex = config.get('mmdbIv');
        if (keyHex && ivHex) {

            const key = Buffer.from(keyHex, "hex");
            const iv = Buffer.from(ivHex, "hex");
            asnFileName = await expandFile(asnFileName + '.enc', key, iv);
            cityFileName = await expandFile(cityFileName + '.enc', key, iv);
        }
        asnDatabase = await maxmind.open<AsnResponse>(asnFileName);
        cityDatabase = await maxmind.open<CityResponse>(cityFileName);
        logger.debug({ asnFileName, cityFileName }, 'mmdb loaded');
    }
    catch (err) {
        logger.error({ err, asnFileName, cityFileName }, 'Unable to load mmdb files');
    }
}

function asnLookup(ip:string): AsnResponse|null {
    if (asnDatabase == null) {
        throw new Error("asn.initialize not called or failed");
    }
    return asnDatabase.get(ip);
}

function cityLookup(ip:string): CityResponse|null {
    if (cityDatabase == null) {
        throw new Error("asn.initialize not called or failed");
    }
    return cityDatabase.get(ip);
}
export {
    asnLookup,
    cityLookup,
    initialize,
}