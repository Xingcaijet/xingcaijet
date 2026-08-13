(function () {
    var header = document.getElementById('header');
    var backToTop = document.getElementById('backToTop');
    var mobileMenuBtn = document.getElementById('mobileMenuBtn');
    var mobileMenu = document.getElementById('mobileMenu');
    var mobileMenuClose = document.getElementById('mobileMenuClose');
    var langBtn = document.getElementById('langBtn');
    var langDropdown = document.getElementById('langDropdown');

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    window.addEventListener('scroll', function () {
        var scrollY = window.scrollY;
        if (scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        if (scrollY > 400) {
            backToTop.classList.add('visible');
        } else {
            backToTop.classList.remove('visible');
        }
    });

    backToTop.addEventListener('click', function () {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    mobileMenuBtn.addEventListener('click', function () {
        mobileMenu.classList.add('open');
        document.body.style.overflow = 'hidden';
    });

    mobileMenuClose.addEventListener('click', function () {
        mobileMenu.classList.remove('open');
        document.body.style.overflow = '';
    });

    document.querySelectorAll('.mobile-menu-link[href^="#"]').forEach(function (link) {
        link.addEventListener('click', function () {
            mobileMenu.classList.remove('open');
            document.body.style.overflow = '';
        });
    });

    if (langBtn) {
        langBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            langDropdown.classList.toggle('open');
        });
        document.addEventListener('click', function (e) {
            if (!langBtn.contains(e.target) && !langDropdown.contains(e.target)) {
                langDropdown.classList.remove('open');
            }
        });
    }

    document.querySelectorAll('.mobile-menu-toggle').forEach(function (toggle) {
        toggle.addEventListener('click', function () {
            var subMenu = this.nextElementSibling;
            var arrow = this.querySelector('.menu-arrow');
            if (subMenu && subMenu.classList.contains('mobile-submenu')) {
                if (subMenu.style.maxHeight) {
                    subMenu.style.maxHeight = null;
                    if (arrow) arrow.classList.remove('active');
                    subMenu.classList.remove('show');
                } else {
                    subMenu.style.maxHeight = subMenu.scrollHeight + 'px';
                    if (arrow) arrow.classList.add('active');
                    subMenu.classList.add('show');
                }
            }
        });
    });

    document.addEventListener('DOMContentLoaded', function () {
        var menuItems = document.querySelectorAll('.mega-menu-item[data-preview]');
        menuItems.forEach(function (item) {
            item.addEventListener('mouseenter', function () {
                var previewId = this.getAttribute('data-preview');
                var previewElement = document.getElementById(previewId);
                var container = this.closest('.mega-menu-image') || this.closest('.mega-menu-container');
                if (container) {
                    container.querySelectorAll('.product-preview').forEach(function (preview) {
                        preview.classList.remove('active');
                    });
                }
                if (previewElement) {
                    previewElement.classList.add('active');
                }
            });
        });
    });

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                if (window.innerWidth < 768 && entry.target.style.transitionDelay) {
                    entry.target.style.transitionDelay = '0s';
                }
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.fade-in').forEach(function (el) {
        observer.observe(el);
    });

    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
        anchor.addEventListener('click', function (e) {
            var targetId = this.getAttribute('href');
            if (targetId === '#') return;
            var target = document.querySelector(targetId);
            if (target) {
                e.preventDefault();
                var headerHeight = header.offsetHeight;
                var targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight;
                window.scrollTo({ top: targetPosition, behavior: 'smooth' });
                if (mobileMenu.classList.contains('open')) {
                    mobileMenu.classList.remove('open');
                    document.body.style.overflow = '';
                }
            }
        });
    });

    var carousel = document.querySelector('.feature-carousel');
    if (carousel) {
        var isDown = false;
        var startX;
        var scrollLeft;
        carousel.addEventListener('mousedown', function (e) {
            isDown = true;
            carousel.style.cursor = 'grabbing';
            startX = e.pageX - carousel.offsetLeft;
            scrollLeft = carousel.scrollLeft;
        });
        carousel.addEventListener('mouseleave', function () {
            isDown = false;
            carousel.style.cursor = 'grab';
        });
        carousel.addEventListener('mouseup', function () {
            isDown = false;
            carousel.style.cursor = 'grab';
        });
        carousel.addEventListener('mousemove', function (e) {
            if (!isDown) return;
            e.preventDefault();
            var x = e.pageX - carousel.offsetLeft;
            var walk = (x - startX) * 2;
            carousel.scrollLeft = scrollLeft - walk;
        });
    }

    var contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function (e) {
            e.preventDefault();
            var btn = this.querySelector('.btn-submit');
            var formStatus = document.getElementById('formStatus');
            var formStatusMessage = document.getElementById('formStatusMessage');
            var name = this.elements['name'].value.trim();
            var email = this.elements['email'].value.trim();
            var phone = this.elements['phone'].value.trim();
            var country = this.elements['country'].value.trim();
            var interest = this.elements['interest'].value;
            var message = this.elements['message'].value.trim();

            if (!email && !phone) {
                formStatus.classList.remove('hidden', 'success');
                formStatus.classList.add('error');
                var errMsg = (window.I18N) ? I18N.t('form.error_contact') : '请至少填写邮箱或电话中的一项，以便我们联系您';
                formStatusMessage.textContent = errMsg;
                return;
            }

            var origText = btn.textContent;
            var submittingText = (window.I18N) ? I18N.t('form.submitting') : '提交中...';
            btn.textContent = submittingText;
            btn.disabled = true;
            formStatus.classList.add('hidden');

            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/leads', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.onreadystatechange = function () {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        formStatus.classList.remove('hidden', 'error');
                        formStatus.classList.add('success');
                        var successMsg = (window.I18N) ? I18N.t('form.success') : '提交成功！我们将尽快与您联系';
                        var successBtn = (window.I18N) ? I18N.t('form.submit_success') : '提交成功';
                        var submitBtn = (window.I18N) ? I18N.t('form.submit') : '提交咨询';
                        formStatusMessage.textContent = successMsg;
                        btn.textContent = successBtn;
                        btn.style.backgroundColor = '#10b981';
                        contactForm.reset();
                        setTimeout(function () {
                            btn.textContent = submitBtn;
                            btn.disabled = false;
                            btn.style.backgroundColor = '';
                            formStatus.classList.add('hidden');
                        }, 3000);
                    } else {
                        formStatus.classList.remove('hidden', 'success');
                        formStatus.classList.add('error');
                        var errMsg = (window.I18N) ? I18N.t('form.error_submit') : '提交失败，请重试';
                        formStatusMessage.textContent = errMsg;
                        btn.textContent = origText;
                        btn.disabled = false;
                    }
                }
            };
            xhr.send(JSON.stringify({
                name: name,
                country: country,
                email: email,
                phone: phone,
                interest: interest,
                message: message
            }));
        });
    }

    function extractYouTubeId(url) {
        if (!url) return null;
        var patterns = [
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
            /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
        ];
        for (var i = 0; i < patterns.length; i++) {
            var match = url.match(patterns[i]);
            if (match) return match[1];
        }
        return null;
    }

    function initYouTubeCards() {
        var videoCards = document.querySelectorAll('[data-youtube-url]');
        videoCards.forEach(function (card) {
            var url = card.getAttribute('data-youtube-url');
            var videoId = extractYouTubeId(url);
            if (!videoId) {
                card.removeAttribute('data-youtube-url');
                return;
            }

            var wrap = card.querySelector('.news-video-wrap');
            var thumbnail = card.querySelector('.video-thumbnail');
            if (thumbnail) {
                thumbnail.src = 'https://img.youtube.com/vi/' + videoId + '/maxresdefault.jpg';
                thumbnail.onerror = function () {
                    thumbnail.src = 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg';
                };
            }

            card.addEventListener('click', function (e) {
                e.preventDefault();
                if (wrap.classList.contains('playing')) return;

                wrap.classList.add('playing');
                var iframe = document.createElement('iframe');
                iframe.className = 'news-video-iframe';
                iframe.src = 'https://www.youtube-nocookie.com/embed/' + videoId + '?autoplay=1&rel=0&modestbranding=1&origin=' + encodeURIComponent(window.location.origin);
                iframe.title = 'YouTube video player';
                iframe.setAttribute('frameborder', '0');
                iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
                iframe.setAttribute('allowfullscreen', '');
                iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
                iframe.setAttribute('loading', 'lazy');
                wrap.appendChild(iframe);
            });
        });
    }

    function createYouTubeVideoCard(video, index) {
        var card = document.createElement('a');
        card.href = '#';
        card.className = 'news-card-link fade-in';
        card.style.transitionDelay = (index * 0.1) + 's';
        card.setAttribute('data-youtube-url', 'https://www.youtube.com/watch?v=' + video.id);

        var dateStr = '';
        if (video.published) {
            var d = new Date(video.published);
            dateStr = d.getFullYear() + '-' +
                String(d.getMonth() + 1).padStart(2, '0') + '-' +
                String(d.getDate()).padStart(2, '0');
        }

        var desc = video.description || '';
        if (desc.length > 100) desc = desc.substring(0, 100) + '...';

        // XSS-safe: escape all user-supplied data before inserting into HTML
        var safeTitle = escapeHtml(video.title || '');
        var safeDesc = escapeHtml(desc);
        var safeThumbnail = escapeHtml(video.thumbnail || '');
        var safeAlt = escapeHtml(video.title || '');

        card.innerHTML =
            '<div class="news-card apple-card">' +
            '<div class="news-image-wrap news-video-wrap">' +
            '<img src="' + safeThumbnail + '" alt="' + safeAlt + '" loading="lazy" class="video-thumbnail">' +
            '<div class="video-play-overlay">' +
            '<div class="video-play-btn"><i class="fas fa-play"></i></div>' +
            '</div>' +
            '</div>' +
            '<div class="news-body">' +
            '<span class="news-date">' + dateStr + '</span>' +
            '<h3>' + safeTitle + '</h3>' +
            '<p>' + safeDesc + '</p>' +
            '<span class="news-link-accent news-video-label"><span data-i18n="news.watch_video">' + (window.I18N ? I18N.t('news.watch_video') : '观看视频') + '</span> <i class="fas fa-play-circle"></i></span>' +
            '</div>' +
            '</div>';

        var wrap = card.querySelector('.news-video-wrap');
        card.addEventListener('click', function (e) {
            e.preventDefault();
            if (wrap.classList.contains('playing')) return;
            wrap.classList.add('playing');
            var iframe = document.createElement('iframe');
            iframe.className = 'news-video-iframe';
            iframe.src = 'https://www.youtube-nocookie.com/embed/' + video.id + '?autoplay=1&rel=0&modestbranding=1&origin=' + encodeURIComponent(window.location.origin);
            iframe.title = safeTitle;
            iframe.setAttribute('frameborder', '0');
            iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
            iframe.setAttribute('allowfullscreen', '');
            iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
            iframe.setAttribute('loading', 'lazy');
            wrap.appendChild(iframe);
        });

        return card;
    }

    function loadYouTubeChannelVideos() {
        var grid = document.getElementById('youtubeVideoGrid');
        if (!grid) return;

        var header = document.getElementById('youtubeVideoHeader');
        var channelId = 'UCif3sMce5X0wLNsrq7RIgsA';
        var rssUrl = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + channelId;
        var CACHE_KEY = 'xincai_yt_videos';
        var CACHE_TIME_KEY = 'xincai_yt_videos_ts';
        var CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours

        var loadingEl = null;
        var renderedCount = 0;

        function showLoading() {
            if (loadingEl) return;
            loadingEl = document.createElement('div');
            loadingEl.className = 'video-loading-indicator';
            loadingEl.innerHTML = '<i class="fas fa-spinner"></i> 加载视频中...';
            grid.appendChild(loadingEl);
        }

        function hideLoading() {
            if (loadingEl && loadingEl.parentNode) {
                loadingEl.parentNode.removeChild(loadingEl);
                loadingEl = null;
            }
        }

        function renderVideos(videos) {
            if (renderedCount > 0) return; // already rendered
            renderedCount++;
            hideLoading();
            if (!videos || videos.length === 0) {
                showError();
                return;
            }
            if (header) header.classList.remove('hidden');
            var isHome = document.body.dataset.page === 'home';
            var displayVideos = isHome ? videos.slice(0, 3) : videos;
            displayVideos.forEach(function (video, i) {
                var card = createYouTubeVideoCard(video, i);
                grid.appendChild(card);
            });
            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('visible');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
            grid.querySelectorAll('.fade-in').forEach(function (el) {
                observer.observe(el);
            });
            // Save to localStorage cache
            try {
                localStorage.setItem(CACHE_KEY, JSON.stringify(videos));
                localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
            } catch (e) {}
        }

        function showError() {
            if (renderedCount > 0) return;
            renderedCount++;
            hideLoading();
            var errEl = document.createElement('div');
            errEl.className = 'video-error-message';
            errEl.innerHTML = '<i class="fas fa-video-slash"></i> 视频暂时无法加载，请检查网络连接后<a href="javascript:location.reload()" style="color:#0071e3;text-decoration:underline;margin-left:4px;">刷新页面</a>';
            grid.appendChild(errEl);
        }

        function parseRSS(xml) {
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
                if (idMatch && titleMatch) {
                    videos.push({
                        id: idMatch[1],
                        title: titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
                        published: pubMatch ? pubMatch[1] : '',
                        description: descMatch ? descMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').substring(0, 160) : '',
                        thumbnail: thumbMatch ? thumbMatch[1] : ('https://img.youtube.com/vi/' + idMatch[1] + '/maxresdefault.jpg')
                    });
                }
            }
            return videos;
        }

        function tryProxy(proxyUrl) {
            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', proxyUrl, true);
                xhr.timeout = 10000;
                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 200) {
                            try {
                                var videos = parseRSS(xhr.responseText);
                                if (videos.length > 0) return resolve(videos);
                                reject(new Error('No videos parsed'));
                            } catch (e) { reject(e); }
                        } else { reject(new Error('HTTP ' + xhr.status)); }
                    }
                };
                xhr.onerror = function () { reject(new Error('Network error')); };
                xhr.ontimeout = function () { reject(new Error('Timeout')); };
                xhr.send();
            });
        }

        function tryServerAPI() {
            return new Promise(function (resolve, reject) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', '/api/youtube-videos?channel_id=' + channelId, true);
                xhr.timeout = 15000;
                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 200) {
                            try {
                                var data = JSON.parse(xhr.responseText);
                                if (data.videos && data.videos.length > 0) return resolve(data.videos);
                                reject(new Error('No videos'));
                            } catch (e) { reject(e); }
                        } else { reject(new Error('HTTP ' + xhr.status)); }
                    }
                };
                xhr.onerror = function () { reject(new Error('Network error')); };
                xhr.ontimeout = function () { reject(new Error('Timeout')); };
                xhr.send();
            });
        }

        // Race all sources in parallel — first success wins
        function fetchVideosRace() {
            var promises = [];

            // Server API first (uses proxy if configured)
            promises.push(tryServerAPI());

            // CORS proxies in parallel
            var proxyUrls = [
                'https://corsproxy.io/?' + encodeURIComponent(rssUrl),
                'https://api.allorigins.win/raw?url=' + encodeURIComponent(rssUrl),
                'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(rssUrl),
                'https://cors.eu.org/' + encodeURIComponent(rssUrl),
                'https://cors-anywhere.herokuapp.com/' + rssUrl
            ];
            proxyUrls.forEach(function (url) {
                promises.push(tryProxy(url));
            });

            // Promise.any: first success wins; if all fail, reject
            return PromiseAny(promises);
        }

        // Promise.any polyfill
        function PromiseAny(promises) {
            return new Promise(function (resolve, reject) {
                var remaining = promises.length;
                var errors = [];
                if (remaining === 0) return reject(new Error('No promises'));
                promises.forEach(function (p, i) {
                    p.then(function (result) {
                        resolve(result);
                    }).catch(function (err) {
                        errors[i] = err;
                        remaining--;
                        if (remaining === 0) {
                            reject(new Error('All sources failed: ' + errors.map(function (e) { return (e && e.message) || '?'; }).join(', ')));
                        }
                    });
                });
            });
        }

        // ===== MAIN FLOW =====
        // Step 1: Try localStorage cache for instant display
        var cacheHit = false;
        try {
            var cachedVideos = localStorage.getItem(CACHE_KEY);
            var cachedTs = parseInt(localStorage.getItem(CACHE_TIME_KEY) || '0');
            if (cachedVideos && (Date.now() - cachedTs) < CACHE_TTL) {
                var videos = JSON.parse(cachedVideos);
                if (videos && videos.length > 0) {
                    cacheHit = true;
                    renderVideos(videos);
                    console.log('YouTube: loaded ' + videos.length + ' videos from cache');
                }
            }
        } catch (e) {}

        // Step 2: Fetch fresh data (show loading only if no cache)
        if (!cacheHit) {
            showLoading();
        }

        fetchVideosRace().then(function (videos) {
            if (cacheHit) {
                // Update cache silently — videos already showing
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify(videos));
                    localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
                } catch (e) {}
                console.log('YouTube: cache updated with ' + videos.length + ' fresh videos');
            } else {
                renderVideos(videos);
                console.log('YouTube: loaded ' + videos.length + ' videos fresh');
            }
        }).catch(function (err) {
            console.warn('YouTube fetch failed:', err.message);
            if (!cacheHit) {
                showError();
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            loadYouTubeChannelVideos();
            initYouTubeCards();
        });
    } else {
        loadYouTubeChannelVideos();
        initYouTubeCards();
    }

    // 细节图轮播
    (function() {
        var track = document.getElementById('detailsTrack');
        var dotsContainer = document.getElementById('detailsDots');
        
        if (!track) return;
        
        var slides = track.querySelectorAll('.pd-details-slide');
        var totalSlides = slides.length;
        var slidesPerView = 4;
        var totalGroups = Math.ceil(totalSlides / slidesPerView);
        var currentGroup = 0;
        
        for (var i = 0; i < totalGroups; i++) {
            var dot = document.createElement('div');
            dot.className = 'pd-details-dot' + (i === 0 ? ' active' : '');
            dot.setAttribute('data-group', i);
            dotsContainer.appendChild(dot);
        }
        
        var dots = dotsContainer.querySelectorAll('.pd-details-dot');
        
        function updateDots() {
            var scrollLeft = track.scrollLeft;
            var slideWidth = slides[0].offsetWidth + 16;
            var groupIndex = Math.round(scrollLeft / (slideWidth * slidesPerView));
            groupIndex = Math.min(groupIndex, totalGroups - 1);
            
            if (groupIndex !== currentGroup) {
                currentGroup = groupIndex;
                dots.forEach(function(d, i) {
                    d.classList.toggle('active', i === currentGroup);
                });
            }
        }
        
        track.addEventListener('scroll', updateDots);
        
        dotsContainer.addEventListener('click', function(e) {
            if (e.target.classList.contains('pd-details-dot')) {
                var group = parseInt(e.target.getAttribute('data-group'));
                var slideWidth = slides[0].offsetWidth + 16;
                track.scrollTo({
                    left: group * slideWidth * slidesPerView,
                    behavior: 'smooth'
                });
            }
        });
        
        // Lightbox
        var lightbox = document.getElementById('pdLightbox');
        var lightboxImg = document.getElementById('lightboxImg');
        var lightboxCounter = document.getElementById('lightboxCounter');
        var lightboxClose = document.getElementById('lightboxClose');
        var lightboxPrev = document.getElementById('lightboxPrev');
        var lightboxNext = document.getElementById('lightboxNext');
        var currentSlideIndex = 0;
        
        slides.forEach(function(slide, index) {
            slide.addEventListener('click', function() {
                openLightbox(index);
            });
        });
        
        function openLightbox(index) {
            currentSlideIndex = index;
            updateLightbox();
            lightbox.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        
        function closeLightbox() {
            lightbox.classList.remove('active');
            document.body.style.overflow = '';
        }
        
        function updateLightbox() {
            var img = slides[currentSlideIndex].querySelector('img');
            lightboxImg.src = img.src;
            lightboxImg.alt = img.alt;
            lightboxCounter.textContent = (currentSlideIndex + 1) + ' / ' + totalSlides;
        }
        
        lightboxClose.addEventListener('click', closeLightbox);
        lightboxPrev.addEventListener('click', function() {
            currentSlideIndex = (currentSlideIndex - 1 + totalSlides) % totalSlides;
            updateLightbox();
        });
        lightboxNext.addEventListener('click', function() {
            currentSlideIndex = (currentSlideIndex + 1) % totalSlides;
            updateLightbox();
        });
        lightbox.addEventListener('click', function(e) {
            if (e.target === lightbox) closeLightbox();
        });
        
        document.addEventListener('keydown', function(e) {
            if (!lightbox.classList.contains('active')) return;
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') { currentSlideIndex = (currentSlideIndex - 1 + totalSlides) % totalSlides; updateLightbox(); }
            if (e.key === 'ArrowRight') { currentSlideIndex = (currentSlideIndex + 1) % totalSlides; updateLightbox(); }
        });
    })();
})();
