import QRCode from 'qrcode';
import fs from 'fs';

const qr = 'SCAN_QR_CODE_HERE';

QRCode.toFile('./remote_qr.png', qr, { scale: 10 }, (err) => {
    if (err) console.error(err);
    else console.log('Remote QR saved to ./remote_qr.png');
});
