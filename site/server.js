require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;
const isVercel = !!process.env.VERCEL;

// Trust proxy for Railway deployment (uses reverse proxy)
app.set('trust proxy', 1);

// --- Required environment variables (no hardcoded fallbacks) ---
const JWT_SECRET = process.env.JWT_SECRET;
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '';

if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set. Exiting.');
    process.exit(1);
}

// --- Admin credentials: persistent config file with env var defaults ---
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');

function loadAdminConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) {
        console.warn('Failed to read config.json, using defaults:', e.message);
    }
    return null;
}

function saveAdminConfig(config) {
    if (isVercel) {
        return;
    }
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (e) {
        console.error('Failed to write config.json:', e.message);
        throw e;
    }
}

// Initialize admin credentials: config.json > env vars > defaults
var adminConfig = loadAdminConfig();
var ADMIN_USER, ADMIN_PASS_HASH;

if (adminConfig && adminConfig.username && adminConfig.passwordHash) {
    ADMIN_USER = adminConfig.username;
    ADMIN_PASS_HASH = adminConfig.passwordHash;
    console.log('Loaded admin credentials from config.json');
} else {
    ADMIN_USER = process.env.ADMIN_USER || 'admin';
    var adminPass = process.env.ADMIN_PASS || 'admin123';
    ADMIN_PASS_HASH = bcrypt.hashSync(adminPass, 10);
    // Persist to config.json
    adminConfig = { username: ADMIN_USER, passwordHash: ADMIN_PASS_HASH };
    saveAdminConfig(adminConfig);
    console.log('Initialized admin credentials (default: admin/admin123). Please change via admin panel.');
}

const YOUTUBE_HANDLE = process.env.YOUTUBE_HANDLE || '@zhongshanxingcaijet';
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || 'UCif3sMce5X0wLNsrq7RIgsA';
const YOUTUBE_CACHE_TTL = 30 * 60 * 1000;
let youtubeCache = { data: null, timestamp: 0 };

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const HTTPS_PROXY_URL = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || '';

let _proxyConfig = null;

function detectProxyPort(callback) {
    var commonPorts = [7890, 10809, 1080, 8118, 8087, 8888, 9090];
    var index = 0;

    function tryNext() {
        if (index >= commonPorts.length) {
            console.log('No local proxy detected. Set HTTPS_PROXY env var if you have a proxy.');
            return callback(null);
        }
        var port = commonPorts[index++];
        var req = http.request({
            host: '127.0.0.1',
            port: port,
            method: 'CONNECT',
            path: 'www.youtube.com:443',
            timeout: 2000
        }, function (res) { /* any response means proxy is there */ });
        req.on('connect', function (res, socket) {
            socket.destroy();
            console.log('Auto-detected proxy at 127.0.0.1:' + port);
            callback({ host: '127.0.0.1', port: port });
        });
        req.on('error', function () { tryNext(); });
        req.on('timeout', function () { req.destroy(); tryNext(); });
        req.end();
    }

    tryNext();
}

function getProxyConfig() {
    if (_proxyConfig !== null) return _proxyConfig;

    var proxyUrl = HTTPS_PROXY_URL;
    if (proxyUrl) {
        try {
            var u = proxyUrl.replace(/^https?:\/\//, '');
            var atIdx = u.lastIndexOf('@');
            var auth = null;
            if (atIdx >= 0) {
                auth = u.substring(0, atIdx);
                u = u.substring(atIdx + 1);
            }
            var colonIdx = u.lastIndexOf(':');
            var host = colonIdx >= 0 ? u.substring(0, colonIdx) : u;
            var port = colonIdx >= 0 ? parseInt(u.substring(colonIdx + 1)) : 8080;
            console.log('Using proxy from env: ' + host + ':' + port + (auth ? ' (with auth)' : ''));
            _proxyConfig = { host: host, port: port, auth: auth };
            return _proxyConfig;
        } catch (e) {
            console.warn('Failed to parse proxy URL [' + proxyUrl + ']:', e.message);
        }
    }

    _proxyConfig = false;
    return false;
}

function setProxyConfig(cfg) {
    _proxyConfig = cfg;
}

const { execFile } = require('child_process');

function fetchUrl(url, opts) {
    opts = opts || {};
    var proxy = getProxyConfig();

    // Method 1: Use curl (handles proxy reliably, system proxy, etc.)
    // Method 2: Fall back to direct Node.js https request
    return fetchUrlViaCurl(url, opts, proxy).catch(function (curlErr) {
        console.warn('curl fetch failed (' + curlErr.message + '), trying direct HTTPS...');
        return fetchUrlViaNode(url, opts);
    });
}

function fetchUrlViaCurl(url, opts, proxyConfig) {
    return new Promise(function (resolve, reject) {
        var args = ['-s', '-L', '--max-time', '15', '--connect-timeout', '8',
            '-H', 'User-Agent: ' + BROWSER_UA,
            '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            '-H', 'Accept-Language: en-US,en;q=0.9,zh-CN;q=0.8'
        ];
        if (proxyConfig) {
            args.push('--proxy', 'http://' + proxyConfig.host + ':' + proxyConfig.port);
            if (proxyConfig.auth) {
                args.push('--proxy-user', proxyConfig.auth);
            }
        }
        args.push(url);

        execFile('curl', args, {
            maxBuffer: 10 * 1024 * 1024,
            timeout: 20000
        }, function (err, stdout) {
            if (err) {
                // curl exits with non-zero on HTTP errors but we still want the body
                if (stdout && stdout.length > 0) {
                    return resolve({ statusCode: 200, body: stdout });
                }
                return reject(err);
            }
            resolve({ statusCode: 200, body: stdout });
        });
    });
}

function fetchUrlViaNode(url, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
        var parsed;
        try {
            var u = url.replace(/^https?:\/\//, '');
            var sl = u.indexOf('/');
            parsed = { hostname: sl >= 0 ? u.substring(0, sl) : u, path: sl >= 0 ? u.substring(sl) : '/' };
        } catch (e) { return reject(e); }

        var defaultHeaders = {
            'User-Agent': BROWSER_UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8'
        };

        var req = https.request({
            hostname: parsed.hostname,
            path: parsed.path,
            method: opts.method || 'GET',
            headers: opts.headers || defaultHeaders,
            timeout: 15000
        }, function (res) {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                var loc = res.headers.location;
                if (loc.startsWith('/')) loc = 'https://' + parsed.hostname + loc;
                return resolve(fetchUrl(loc, opts));
            }
            var chunks = [];
            res.on('data', function (c) { chunks.push(c); });
            res.on('end', function () {
                var body = Buffer.concat(chunks).toString('utf8');
                resolve({ statusCode: res.statusCode, body: body });
            });
        });
        req.on('error', function (e) { reject(e); });
        req.on('timeout', function () { req.destroy(); reject(new Error('timeout')); });
        req.end();
    });
}

async function resolveChannelId(handle) {
    var clean = handle.replace('@', '');
    var urls = [
        'https://www.youtube.com/@' + clean + '/about',
        'https://www.youtube.com/@' + clean
    ];
    for (var u = 0; u < urls.length; u++) {
        try {
            var result = await fetchUrl(urls[u]);
            var html = result.body;
            var patterns = [
                /"channelId"\s*:\s*"(UC[a-zA-Z0-9_-]{22})"/,
                /"externalId"\s*:\s*"(UC[a-zA-Z0-9_-]{22})"/,
                /<meta\s+itemprop="channelId"\s+content="(UC[a-zA-Z0-9_-]{22})"/i,
                /https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})/g,
                /"browseId"\s*:\s*"(UC[a-zA-Z0-9_-]{22})"/g
            ];
            for (var i = 0; i < patterns.length; i++) {
                var match = html.match(patterns[i]);
                if (match) return match[1];
            }
        } catch (e) {
            console.warn('Failed to fetch ' + urls[u] + ':', e.message);
        }
    }
    return null;
}

async function fetchYouTubeFeed(channelId) {
    var rssUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId;
    var result = await fetchUrl(rssUrl);
    return result.body;
}

function parseYouTubeRSS(xml) {
    var videos = [];
    var entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    var entryMatch;
    while ((entryMatch = entryRegex.exec(xml)) !== null) {
        var entry = entryMatch[1];

        var idMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
        var titleMatch = entry.match(/<title[^>]*>([^<]+)<\/title>/);
        var pubMatch = entry.match(/<published>([^<]+)<\/published>/);
        var descMatch = entry.match(/<media:description[^>]*>([^<]*)<\/media:description>/);
        var thumbMatch = entry.match(/<media:thumbnail[^>]*url="([^"]+)"/);
        var linkMatch = entry.match(/<link[^>]*href="([^"]+)"[^>]*\/>/);

        if (idMatch && titleMatch) {
            videos.push({
                id: idMatch[1],
                title: titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
                published: pubMatch ? pubMatch[1] : '',
                description: descMatch ? descMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '',
                thumbnail: thumbMatch ? thumbMatch[1] : ('https://img.youtube.com/vi/' + idMatch[1] + '/maxresdefault.jpg'),
                link: linkMatch ? linkMatch[1] : ('https://www.youtube.com/watch?v=' + idMatch[1])
            });
        }
    }
    return videos;
}

// Auto-detect environment early so middleware can reference it
var isProduction = process.env.NODE_ENV === 'production';

const ADMIN_PATH = '/admin-xincai';

const DATA_DIR = path.join(__dirname, 'data');
const RUNTIME_DATA_DIR = isVercel ? path.join('/tmp', 'xingcaijet-data') : DATA_DIR;
const LEADS_FILE = path.join(RUNTIME_DATA_DIR, 'leads.json');
const VIDEOS_FILE = path.join(RUNTIME_DATA_DIR, 'youtube-videos.json');

function ensureJsonFile(filePath, fallbackValue) {
    try {
        if (!fs.existsSync(RUNTIME_DATA_DIR)) {
            fs.mkdirSync(RUNTIME_DATA_DIR, { recursive: true });
        }
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(fallbackValue, null, 2));
        }
    } catch (e) {
        console.error('Failed to initialize data file:', filePath, e.message);
    }
}

ensureJsonFile(LEADS_FILE, []);
ensureJsonFile(VIDEOS_FILE, []);

function readLeads() {
    try {
        return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function writeLeads(leads) {
    try {
        fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
    } catch (e) {
        console.error('Failed to write leads file:', e.message);
        throw e;
    }
}

function readLocalVideos() {
    try {
        return JSON.parse(fs.readFileSync(VIDEOS_FILE, 'utf8'));
    } catch (e) {
        return [];
    }
}

function writeLocalVideos(videos) {
    try {
        fs.writeFileSync(VIDEOS_FILE, JSON.stringify(videos, null, 2));
    } catch (e) {
        console.error('Failed to write videos file:', e.message);
        throw e;
    }
}

function extractYouTubeId(url) {
    var patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    for (var i = 0; i < patterns.length; i++) {
        var match = url.match(patterns[i]);
        if (match) return match[1];
    }
    return null;
}

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        req.admin = decoded;
        next();
    } catch (e) {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

if (isProduction) {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
                imgSrc: ["'self'", "data:", "https://img.youtube.com", "https://i.ytimg.com", "https://*.ggpht.com"],
                frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
                connectSrc: ["'self'", "https://www.youtube.com", "https://api.allorigins.win", "https://corsproxy.io", "https://api.codetabs.com", "https://cors.eu.org", "https://cors-anywhere.herokuapp.com"],
                mediaSrc: ["'self'", "blob:"]
            }
        },
        referrerPolicy: {
            policy: 'strict-origin-when-cross-origin'
        },
        crossOriginEmbedderPolicy: false
    }));
}

// CORS: restrict to configured origins in production
var corsOptions = {};
if (ALLOWED_ORIGINS && ALLOWED_ORIGINS !== '*') {
    var origins = ALLOWED_ORIGINS.split(',').map(function (o) { return o.trim(); });
    corsOptions.origin = function (origin, callback) {
        if (!origin || origins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    };
}
app.use(cors(corsOptions));

// Rate limiting for auth-related endpoints
var authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many attempts, please try again after 15 minutes' },
    standardHeaders: true,
    legacyHeaders: false
});

app.use(compression());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// --- IP-based language auto-detection ---
// Sets a xincai_lang cookie on first page visit based on the visitor's country.
// The client-side i18n.js reads this cookie as its default language.
var LANG_COOKIE = 'xincai_lang';
var COUNTRY_LANG = {
    CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh', SG: 'zh',
    JP: 'ja', KR: 'ko',
    RU: 'ru', BY: 'ru', KZ: 'ru', UA: 'ru',
    SA: 'ar', AE: 'ar', EG: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', JO: 'ar', LB: 'ar', IQ: 'ar', YE: 'ar', SY: 'ar', MA: 'ar', DZ: 'ar', TN: 'ar', LY: 'ar', SD: 'ar', PS: 'ar',
    TH: 'th', VN: 'vi',
    FR: 'fr', BE: 'fr', CH: 'fr', LU: 'fr', MC: 'fr', CA: 'fr',
    DE: 'de', AT: 'de', LI: 'de',
    ES: 'es', MX: 'es', AR: 'es', CO: 'es', CL: 'es', PE: 'es', VE: 'es', EC: 'es', GT: 'es', CU: 'es', BO: 'es', DO: 'es', HN: 'es', PY: 'es', SV: 'es', NI: 'es', CR: 'es', PA: 'es', UY: 'es', PR: 'es',
    PT: 'pt', BR: 'pt', AO: 'pt', MZ: 'pt', CV: 'pt', GW: 'pt', ST: 'pt', TL: 'pt'
};
var geoCache = Object.create(null);
var GEO_CACHE_TTL = 6 * 60 * 60 * 1000;

function countryToLang(code) {
    return COUNTRY_LANG[code] || 'en';
}

function parseCookies(header) {
    var out = {};
    if (!header) return out;
    header.split(';').forEach(function (pair) {
        var i = pair.indexOf('=');
        if (i > 0) out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
    });
    return out;
}

function isPrivateIp(ip) {
    if (!ip) return true;
    return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd)/.test(ip);
}

function lookupCountryByIp(ip, callback) {
    var cached = geoCache[ip];
    if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) {
        return callback(null, cached.country);
    }
    var req = https.get({
        hostname: 'ipwho.is',
        path: '/' + ip,
        timeout: 2500
    }, function (res) {
        var chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
            try {
                var data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (data.success && data.country_code && data.country_code.length === 2) {
                    geoCache[ip] = { country: data.country_code, ts: Date.now() };
                    return callback(null, data.country_code);
                }
            } catch (e) {}
            callback(null, null);
        });
    });
    req.on('error', function () { callback(null, null); });
    req.on('timeout', function () { req.destroy(); callback(null, null); });
    req.end();
}

app.use(function (req, res, next) {
    if (req.method !== 'GET') return next();
    var p = req.path;
    if (p.indexOf('/api/') === 0 || p === ADMIN_PATH || p.indexOf(ADMIN_PATH + '/') === 0) return next();
    if (p.indexOf('.') !== -1 && !/\.html$/i.test(p)) return next(); // skip static assets
    if (parseCookies(req.headers.cookie)[LANG_COOKIE]) return next(); // language already chosen

    function apply(country) {
        if (!country) return next();
        var lang = countryToLang(country);
        // Not httpOnly so client-side i18n.js can read it as the default language
        res.setHeader('Set-Cookie', LANG_COOKIE + '=' + lang + '; Path=/; Max-Age=31536000; SameSite=Lax');
        next();
    }

    // On Vercel the country is provided by the edge network — no external lookup needed
    var countryHeader = req.headers['x-vercel-ip-country'];
    if (countryHeader && countryHeader.length === 2) return apply(countryHeader);

    var ip = req.ip;
    if (isPrivateIp(ip)) return next();
    lookupCountryByIp(ip, function (err, country) {
        apply(country);
    });
});

app.get(ADMIN_PATH, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin', 'index.html'));
});
app.use(ADMIN_PATH + '/static', express.static(path.join(__dirname, 'admin')));

// Block access to sensitive paths before serving static files
app.use(function (req, res, next) {
    if (req.path.startsWith('/data/') || req.path.startsWith('/node_modules/') || req.path === '/server.js') {
        return res.status(404).send('Not found');
    }
    next();
});

app.use(express.static(__dirname, {
    index: 'index.html',
    extensions: ['html'],
    maxAge: '1d',
    setHeaders: (res, filePath) => {
        if (/\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (/\.(css|js)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (/\.html$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

app.post('/api/admin/login', authLimiter, (req, res) => {
    const { username, password } = req.body;
    if (username !== ADMIN_USER) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!bcrypt.compareSync(password, ADMIN_PASS_HASH)) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, username });
});

// Change admin username (requires auth)
app.patch('/api/admin/username', authLimiter, authMiddleware, (req, res) => {
    var { newUsername, password } = req.body;
    if (!newUsername || !password) {
        return res.status(400).json({ error: '新用户名和当前密码不能为空' });
    }
    if (newUsername.length < 3 || newUsername.length > 30) {
        return res.status(400).json({ error: '用户名长度需在 3-30 个字符之间' });
    }
    if (!bcrypt.compareSync(password, ADMIN_PASS_HASH)) {
        return res.status(401).json({ error: '当前密码错误' });
    }
    ADMIN_USER = newUsername;
    adminConfig.username = newUsername;
    saveAdminConfig(adminConfig);
    // Issue new token with updated username
    var token = jwt.sign({ username: newUsername }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token: token, username: newUsername });
});

// Change admin password (requires auth)
app.patch('/api/admin/password', authLimiter, authMiddleware, (req, res) => {
    var { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: '当前密码和新密码不能为空' });
    }
    if (newPassword.length < 6) {
        return res.status(400).json({ error: '新密码长度不能少于 6 个字符' });
    }
    if (!bcrypt.compareSync(currentPassword, ADMIN_PASS_HASH)) {
        return res.status(401).json({ error: '当前密码错误' });
    }
    ADMIN_PASS_HASH = bcrypt.hashSync(newPassword, 10);
    adminConfig.passwordHash = ADMIN_PASS_HASH;
    saveAdminConfig(adminConfig);
    res.json({ success: true });
});

app.post('/api/leads', (req, res) => {
    const { name, country, email, phone, interest, message } = req.body;
    if (!name || (!email && !phone)) {
        return res.status(400).json({ error: 'Name and at least email or phone are required' });
    }
    // Input length validation
    if ((name && name.length > 100) || (email && email.length > 200) || (phone && phone.length > 30) ||
        (country && country.length > 80) || (interest && interest.length > 100) || (message && message.length > 2000)) {
        return res.status(400).json({ error: 'Input exceeds maximum length' });
    }
    const lead = {
        id: uuidv4(),
        name: name || '',
        country: country || '',
        email: email || '',
        phone: phone || '',
        interest: interest || '',
        message: message || '',
        status: 'new',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    const leads = readLeads();
    leads.unshift(lead);
    writeLeads(leads);
    res.json({ success: true, id: lead.id });
});

app.get('/api/leads', authMiddleware, (req, res) => {
    const leads = readLeads();
    const { status, search, page = 1, limit = 20 } = req.query;
    let filtered = leads;
    if (status && status !== 'all') {
        filtered = filtered.filter(l => l.status === status);
    }
    if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(l =>
            (l.name && l.name.toLowerCase().includes(s)) ||
            (l.country && l.country.toLowerCase().includes(s)) ||
            (l.email && l.email.toLowerCase().includes(s)) ||
            (l.phone && l.phone.includes(s)) ||
            (l.interest && l.interest.toLowerCase().includes(s)) ||
            (l.message && l.message.toLowerCase().includes(s))
        );
    }
    const total = filtered.length;
    const start = (parseInt(page) - 1) * parseInt(limit);
    const paginated = filtered.slice(start, start + parseInt(limit));
    res.json({
        leads: paginated,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        stats: {
            total: leads.length,
            new: leads.filter(l => l.status === 'new').length,
            contacted: leads.filter(l => l.status === 'contacted').length,
            closed: leads.filter(l => l.status === 'closed').length
        }
    });
});

app.get('/api/leads/:id', authMiddleware, (req, res) => {
    const leads = readLeads();
    const lead = leads.find(l => l.id === req.params.id);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
});

app.patch('/api/leads/:id', authMiddleware, (req, res) => {
    const leads = readLeads();
    const index = leads.findIndex(l => l.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Lead not found' });
    if (req.body.status) {
        var allowedStatuses = ['new', 'contacted', 'closed'];
        if (allowedStatuses.indexOf(req.body.status) === -1) {
            return res.status(400).json({ error: 'Invalid status. Allowed: new, contacted, closed' });
        }
        leads[index].status = req.body.status;
    }
    leads[index].updatedAt = new Date().toISOString();
    writeLeads(leads);
    res.json(leads[index]);
});

app.delete('/api/leads/:id', authMiddleware, (req, res) => {
    let leads = readLeads();
    const index = leads.findIndex(l => l.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Lead not found' });
    leads.splice(index, 1);
    writeLeads(leads);
    res.json({ success: true });
});

app.get('/api/youtube-videos', async (req, res) => {
    try {
        var channelId = req.query.channel_id || YOUTUBE_CHANNEL_ID || null;

        if (!channelId && youtubeCache.channelId) {
            channelId = youtubeCache.channelId;
        }

        if (!channelId) {
            channelId = await resolveChannelId(YOUTUBE_HANDLE);
        }

        if (!channelId) {
            // No channel ID resolvable, serve from local cache
            var localVideos = readLocalVideos();
            return res.json({ videos: localVideos, source: 'local', hint: 'Set YOUTUBE_CHANNEL_ID env var for live sync' });
        }

        if (channelId !== youtubeCache.channelId) {
            youtubeCache.channelId = channelId;
            youtubeCache.data = null;
        }

        var now = Date.now();
        if (youtubeCache.data && youtubeCache.channelId === channelId && (now - youtubeCache.timestamp) < YOUTUBE_CACHE_TTL) {
            return res.json({ videos: youtubeCache.data, channelId: channelId, cached: true, source: 'live' });
        }

        var xml = await fetchYouTubeFeed(channelId);
        var videos = parseYouTubeRSS(xml);

        youtubeCache = { data: videos, timestamp: now, channelId: channelId };

        // Sync to local JSON file so it's available when live fetch fails
        if (videos.length > 0) {
            try { writeLocalVideos(videos); } catch (e) {}
        }

        res.json({ videos: videos, channelId: channelId, cached: false, source: 'live' });
    } catch (e) {
        console.error('YouTube API error:', e.message);
        // Try in-memory cache first
        if (youtubeCache.data) {
            return res.json({ videos: youtubeCache.data, channelId: youtubeCache.channelId, cached: true, stale: true, source: 'cache' });
        }
        // Fall back to local JSON file
        var localVideos = readLocalVideos();
        if (localVideos.length > 0) {
            console.log('Serving ' + localVideos.length + ' videos from local cache');
            return res.json({ videos: localVideos, source: 'local' });
        }
        res.status(502).json({ error: 'Failed to fetch YouTube videos. Add videos via POST /api/youtube-videos/add' });
    }
});

// Admin endpoint: add a YouTube video to local cache
app.post('/api/youtube-videos/add', authMiddleware, (req, res) => {
    var url = req.body.url || '';
    var videoId = extractYouTubeId(url);
    if (!videoId) {
        return res.status(400).json({ error: 'Invalid YouTube URL. Expected formats: https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID' });
    }
    var videos = readLocalVideos();
    // Check if already exists
    if (videos.find(function (v) { return v.id === videoId; })) {
        return res.json({ success: true, id: videoId, message: 'Video already exists' });
    }
    var entry = {
        id: videoId,
        title: req.body.title || ('YouTube Video ' + videoId),
        published: req.body.published || new Date().toISOString(),
        description: req.body.description || '',
        thumbnail: 'https://img.youtube.com/vi/' + videoId + '/maxresdefault.jpg'
    };
    videos.unshift(entry);
    writeLocalVideos(videos);
    res.json({ success: true, id: videoId, video: entry });
});

// Admin endpoint: remove a video from local cache
app.delete('/api/youtube-videos/:videoId', authMiddleware, (req, res) => {
    var videos = readLocalVideos();
    var index = videos.findIndex(function (v) { return v.id === req.params.videoId; });
    if (index === -1) return res.status(404).json({ error: 'Video not found' });
    videos.splice(index, 1);
    writeLocalVideos(videos);
    res.json({ success: true });
});

// Public endpoint: list locally cached videos (for reference)
app.get('/api/youtube-videos/local', (req, res) => {
    res.json({ videos: readLocalVideos(), source: 'local' });
});

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }
    // Block access to sensitive directories
    if (req.path.startsWith('/data/') || req.path.startsWith('/node_modules/') || req.path === '/server.js') {
        return res.status(404).send('Not found');
    }
    try {
        const filePath = path.join(__dirname, req.path);
        const normalizedPath = path.resolve(filePath);
        // Ensure the resolved path is within __dirname
        if (!normalizedPath.startsWith(__dirname)) {
            console.log('[ROUTE] Path traversal blocked:', req.path);
            return res.status(404).send('Not found');
        }
        if (fs.existsSync(normalizedPath) && fs.statSync(normalizedPath).isFile()) {
            console.log('[ROUTE] Serving file:', normalizedPath);
            return res.sendFile(normalizedPath);
        }
        // Try with .html extension for clean URLs
        const htmlPath = normalizedPath + '.html';
        if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
            console.log('[ROUTE] Serving .html file:', htmlPath);
            return res.sendFile(htmlPath);
        }
        console.log('[ROUTE] Falling back to index.html for:', req.path);
        res.sendFile(path.join(__dirname, 'index.html'));
    } catch (e) {
        console.error('Catch-all route error:', e.message);
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

// Global error handler
app.use(function (err, req, res, next) {
    console.error('Unhandled error:', err.message);
    if (err.message && err.message === 'Not allowed by CORS') {
        return res.status(403).json({ error: 'CORS not allowed' });
    }
    res.status(500).json({ error: 'Internal server error' });
});

// Vercel imports the app as a serverless function; local/Railway runs this file directly.
if (require.main !== module) {
    module.exports = app;
} else if (isProduction) {
    console.log('Production mode: skipping local proxy detection.');
    startServer();
} else {
    detectProxyPort(function (proxyConfig) {
        if (proxyConfig) {
            setProxyConfig(proxyConfig);
            console.log('YouTube fetch will route through proxy at ' + proxyConfig.host + ':' + proxyConfig.port);
        } else {
            console.log('No proxy detected — YouTube fetch may fail in China.');
            console.log('To use a proxy, set HTTPS_PROXY env var:');
            console.log('  HTTPS_PROXY=http://127.0.0.1:7890 node server.js');
        }
        startServer();
    });
}

function startServer() {
    app.listen(PORT, () => {
        console.log('XINCAIJET server running on http://localhost:' + PORT);
        console.log('Admin panel: http://localhost:' + PORT + ADMIN_PATH);
    });
}
