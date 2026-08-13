(function () {
    'use strict';

    var I18N = {
        currentLang: 'zh',
        translations: {},
        supportedLangs: [
            { code: 'zh', name: '简体中文', flag: '🇨🇳' },
            { code: 'en', name: 'English', flag: '🇬🇧' },
            { code: 'ru', name: 'Русский', flag: '🇷🇺' },
            { code: 'ja', name: '日本語', flag: '🇯🇵' },
            { code: 'ko', name: '한국어', flag: '🇰🇷' },
            { code: 'es', name: 'Español', flag: '🇪🇸' },
            { code: 'pt', name: 'Português', flag: '🇧🇷' },
            { code: 'fr', name: 'Français', flag: '🇫🇷' },
            { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
            { code: 'ar', name: 'العربية', flag: '🇸🇦' },
            { code: 'th', name: 'ภาษาไทย', flag: '🇹🇭' },
            { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳' }
        ],

        init: function () {
            var saved = localStorage.getItem('xincai_lang');
            if (saved && this.isValidLang(saved)) {
                this.currentLang = saved;
            } else {
                // IP-based detection: server sets xincai_lang cookie from the visitor's country
                var cookieLang = this.getCookie('xincai_lang');
                if (cookieLang && this.isValidLang(cookieLang)) {
                    this.currentLang = cookieLang;
                } else {
                    var browserLang = (navigator.language || navigator.userLanguage || 'zh').substring(0, 2);
                    if (this.isValidLang(browserLang)) {
                        this.currentLang = browserLang;
                    }
                }
            }
            this.loadAndApply(this.currentLang);
        },

        getCookie: function (name) {
            var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
            return match ? decodeURIComponent(match[1]) : '';
        },

        isValidLang: function (code) {
            for (var i = 0; i < this.supportedLangs.length; i++) {
                if (this.supportedLangs[i].code === code) return true;
            }
            return false;
        },

        loadAndApply: function (lang) {
            var self = this;
            if (self.translations[lang]) {
                self.applyTranslations(lang);
                return;
            }
            var scriptEl = document.querySelector('script[src*="i18n.js"]');
            var basePath = '';
            if (scriptEl) {
                var src = scriptEl.getAttribute('src');
                basePath = src.substring(0, src.lastIndexOf('/') + 1);
            }
            var xhr = new XMLHttpRequest();
            xhr.open('GET', basePath + 'lang/' + lang + '.json?v=' + Date.now(), true);
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        try {
                            self.translations[lang] = JSON.parse(xhr.responseText);
                        } catch (e) {
                            self.translations[lang] = {};
                        }
                    } else {
                        self.translations[lang] = {};
                    }
                    self.applyTranslations(lang);
                }
            };
            xhr.send();
        },

        applyTranslations: function (lang) {
            this.currentLang = lang;
            localStorage.setItem('xincai_lang', lang);

            var dict = this.translations[lang] || {};

            if (lang === 'ar') {
                document.documentElement.setAttribute('dir', 'rtl');
                document.documentElement.setAttribute('lang', 'ar');
            } else {
                document.documentElement.setAttribute('dir', 'ltr');
                document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-CN' : lang);
            }

            var elements = document.querySelectorAll('[data-i18n]');
            for (var i = 0; i < elements.length; i++) {
                var el = elements[i];
                var key = el.getAttribute('data-i18n');
                if (dict[key] !== undefined) {
                    el.textContent = dict[key];
                }
            }

            var placeholders = document.querySelectorAll('[data-i18n-placeholder]');
            for (var j = 0; j < placeholders.length; j++) {
                var pel = placeholders[j];
                var pkey = pel.getAttribute('data-i18n-placeholder');
                if (dict[pkey] !== undefined) {
                    pel.setAttribute('placeholder', dict[pkey]);
                }
            }

            var options = document.querySelectorAll('option[data-i18n]');
            for (var k = 0; k < options.length; k++) {
                var opt = options[k];
                var okey = opt.getAttribute('data-i18n');
                if (dict[okey] !== undefined) {
                    opt.textContent = dict[okey];
                }
            }

            var titles = document.querySelectorAll('[data-i18n-title]');
            for (var t = 0; t < titles.length; t++) {
                var tel = titles[t];
                var tkey = tel.getAttribute('data-i18n-title');
                if (dict[tkey] !== undefined) {
                    tel.setAttribute('title', dict[tkey]);
                }
            }

            this.updateLangSwitcherUI(lang);
            this.updateDocumentTitle(lang, dict);
        },

        updateDocumentTitle: function (lang, dict) {
            var pageKey = document.body.getAttribute('data-page');
            if (pageKey && dict['title.' + pageKey]) {
                document.title = dict['title.' + pageKey];
            }
        },

        updateLangSwitcherUI: function (lang) {
            var langInfo = null;
            for (var i = 0; i < this.supportedLangs.length; i++) {
                if (this.supportedLangs[i].code === lang) {
                    langInfo = this.supportedLangs[i];
                    break;
                }
            }
            if (!langInfo) return;

            var btnSpan = document.querySelector('#langBtn > span');
            if (btnSpan) {
                btnSpan.textContent = langInfo.flag + ' ' + langInfo.name;
            }

            var desktopOptions = document.querySelectorAll('#langDropdown .lang-option');
            for (var j = 0; j < desktopOptions.length; j++) {
                desktopOptions[j].classList.remove('active');
                if (desktopOptions[j].getAttribute('data-lang') === lang) {
                    desktopOptions[j].classList.add('active');
                }
            }

            var mobileLinks = document.querySelectorAll('#mobileLangSubmenu .mobile-submenu-link');
            for (var k = 0; k < mobileLinks.length; k++) {
                mobileLinks[k].classList.remove('active');
                if (mobileLinks[k].getAttribute('data-lang') === lang) {
                    mobileLinks[k].classList.add('active');
                }
            }
        },

        switchLang: function (lang) {
            if (this.isValidLang(lang) && lang !== this.currentLang) {
                this.loadAndApply(lang);
            }
        },

        t: function (key) {
            var dict = this.translations[this.currentLang] || {};
            return dict[key] || key;
        },

        buildLangSwitcherHTML: function () {
            var html = '';
            for (var i = 0; i < this.supportedLangs.length; i++) {
                var l = this.supportedLangs[i];
                var activeClass = l.code === this.currentLang ? ' active' : '';
                html += '<a href="#" class="lang-option' + activeClass + '" data-lang="' + l.code + '">' +
                    '<span class="lang-flag">' + l.flag + '</span>' +
                    '<span class="lang-name">' + l.name + '</span></a>';
            }
            return html;
        },

        buildMobileLangHTML: function () {
            var html = '';
            for (var i = 0; i < this.supportedLangs.length; i++) {
                var l = this.supportedLangs[i];
                var activeClass = l.code === this.currentLang ? ' active' : '';
                html += '<div class="mobile-submenu-item"><a href="#" class="mobile-submenu-link' + activeClass +
                    '" data-lang="' + l.code + '">' + l.flag + ' ' + l.name + '</a></div>';
            }
            return html;
        },

        initSwitcherEvents: function () {
            var self = this;

            var dropdown = document.getElementById('langDropdown');
            if (dropdown) {
                dropdown.innerHTML = this.buildLangSwitcherHTML();
                dropdown.addEventListener('click', function (e) {
                    var option = e.target.closest('.lang-option');
                    if (option) {
                        e.preventDefault();
                        var lang = option.getAttribute('data-lang');
                        self.switchLang(lang);
                        dropdown.classList.remove('open');
                    }
                });
            }

            var mobileSubmenu = document.getElementById('mobileLangSubmenu');
            if (mobileSubmenu) {
                mobileSubmenu.innerHTML = this.buildMobileLangHTML();
                mobileSubmenu.addEventListener('click', function (e) {
                    var link = e.target.closest('.mobile-submenu-link');
                    if (link) {
                        e.preventDefault();
                        var lang = link.getAttribute('data-lang');
                        self.switchLang(lang);
                    }
                });
            }
        }
    };

    window.I18N = I18N;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            I18N.initSwitcherEvents();
            I18N.init();
        });
    } else {
        I18N.initSwitcherEvents();
        I18N.init();
    }
})();
