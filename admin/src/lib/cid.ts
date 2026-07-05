const CID_KEY = 77;
const CID_CODES = [124, 125, 127, 121, 124, 125, 127, 121];

export const getAdminCid = () => CID_CODES.map((code) => String.fromCharCode(code ^ CID_KEY)).join('');
