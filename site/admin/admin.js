(function () {
    var API = '/api';
    var token = localStorage.getItem('admin_token');
    var currentPage = 1;
    var currentFilter = 'all';
    var currentSearch = '';
    var currentLeadId = null;

    var loginPage = document.getElementById('loginPage');
    var adminApp = document.getElementById('adminApp');
    var loginForm = document.getElementById('loginForm');
    var loginError = document.getElementById('loginError');
    var adminUsername = document.getElementById('adminUsername');

    function checkAuth() {
        if (token) {
            loginPage.classList.add('hidden');
            adminApp.classList.remove('hidden');
            loadDashboard();
        } else {
            loginPage.classList.remove('hidden');
            adminApp.classList.add('hidden');
        }
    }

    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var user = document.getElementById('loginUser').value;
        var pass = document.getElementById('loginPass').value;
        loginError.classList.add('hidden');

        apiRequest('POST', '/admin/login', { username: user, password: pass }, function (err, data) {
            if (err || !data.token) {
                loginError.classList.remove('hidden');
                return;
            }
            token = data.token;
            localStorage.setItem('admin_token', token);
            adminUsername.textContent = data.username;
            checkAuth();
        });
    });

    document.getElementById('logoutBtn').addEventListener('click', function () {
        token = null;
        localStorage.removeItem('admin_token');
        checkAuth();
    });

    function apiRequest(method, url, body, cb) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, API + url, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                try {
                    var data = JSON.parse(xhr.responseText);
                    if (xhr.status >= 200 && xhr.status < 300) {
                        cb(null, data);
                    } else {
                        if (xhr.status === 401) {
                            token = null;
                            localStorage.removeItem('admin_token');
                            checkAuth();
                        }
                        cb(data.error || 'Error');
                    }
                } catch (e) {
                    cb('Parse error');
                }
            }
        };
        xhr.send(body ? JSON.stringify(body) : null);
    }

    document.querySelectorAll('.sidebar-link').forEach(function (link) {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            document.querySelectorAll('.sidebar-link').forEach(function (l) { l.classList.remove('active'); });
            this.classList.add('active');
            var view = this.getAttribute('data-view');
            document.querySelectorAll('.admin-view').forEach(function (v) { v.classList.add('hidden'); });
            if (view === 'dashboard') {
                document.getElementById('dashboardView').classList.remove('hidden');
                document.getElementById('pageTitle').textContent = '控制台';
                loadDashboard();
            } else if (view === 'leads') {
                document.getElementById('leadsView').classList.remove('hidden');
                document.getElementById('pageTitle').textContent = '客户线索管理';
                loadLeads();
            } else if (view === 'settings') {
                document.getElementById('settingsView').classList.remove('hidden');
                document.getElementById('pageTitle').textContent = '设置';
            }
        });
    });

    function loadDashboard() {
        apiRequest('GET', '/leads?limit=5', null, function (err, data) {
            if (err) return;
            document.getElementById('statTotal').textContent = data.stats.total;
            document.getElementById('statNew').textContent = data.stats.new;
            document.getElementById('statContacted').textContent = data.stats.contacted;
            document.getElementById('statClosed').textContent = data.stats.closed;

            var tbody = document.getElementById('recentTableBody');
            tbody.innerHTML = '';
            if (data.leads.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:rgba(245,245,247,0.4);padding:40px;">暂无线索数据</td></tr>';
                return;
            }
            data.leads.forEach(function (lead) {
                var tr = document.createElement('tr');
                tr.innerHTML = '<td>' + esc(lead.name) + '</td>' +
                    '<td>' + esc(lead.country) + '</td>' +
                    '<td>' + esc(lead.interest) + '</td>' +
                    '<td>' + formatDate(lead.createdAt) + '</td>' +
                    '<td><span class="status-badge ' + lead.status + '">' + statusText(lead.status) + '</span></td>';
                tbody.appendChild(tr);
            });
        });
    }

    function loadLeads() {
        var url = '/leads?page=' + currentPage + '&limit=15';
        if (currentFilter !== 'all') url += '&status=' + currentFilter;
        if (currentSearch) url += '&search=' + encodeURIComponent(currentSearch);

        apiRequest('GET', url, null, function (err, data) {
            if (err) return;

            document.getElementById('statTotal').textContent = data.stats.total;
            document.getElementById('statNew').textContent = data.stats.new;
            document.getElementById('statContacted').textContent = data.stats.contacted;
            document.getElementById('statClosed').textContent = data.stats.closed;

            var tbody = document.getElementById('leadsTableBody');
            tbody.innerHTML = '';
            if (data.leads.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:rgba(245,245,247,0.4);padding:40px;">暂无线索数据</td></tr>';
                document.getElementById('pagination').innerHTML = '';
                return;
            }
            data.leads.forEach(function (lead) {
                var tr = document.createElement('tr');
                tr.innerHTML = '<td>' + esc(lead.name) + '</td>' +
                    '<td>' + esc(lead.country) + '</td>' +
                    '<td>' + esc(lead.email) + '</td>' +
                    '<td>' + esc(lead.phone) + '</td>' +
                    '<td>' + esc(lead.interest) + '</td>' +
                    '<td>' + formatDate(lead.createdAt) + '</td>' +
                    '<td><span class="status-badge ' + lead.status + '">' + statusText(lead.status) + '</span></td>' +
                    '<td><button class="action-btn" onclick="window.viewLead(\'' + lead.id + '\')">查看</button><button class="action-btn danger" onclick="window.deleteLead(\'' + lead.id + '\')">删除</button></td>';
                tbody.appendChild(tr);
            });

            renderPagination(data.page, data.totalPages);
        });
    }

    function renderPagination(page, totalPages) {
        var div = document.getElementById('pagination');
        div.innerHTML = '';
        if (totalPages <= 1) return;

        var prevBtn = document.createElement('button');
        prevBtn.className = 'page-btn';
        prevBtn.textContent = '上一页';
        prevBtn.disabled = page <= 1;
        prevBtn.addEventListener('click', function () { currentPage = page - 1; loadLeads(); });
        div.appendChild(prevBtn);

        for (var i = 1; i <= totalPages; i++) {
            if (totalPages > 7 && i > 3 && i < totalPages - 2 && Math.abs(i - page) > 1) {
                if (i === 4 || i === totalPages - 3) {
                    var dots = document.createElement('span');
                    dots.textContent = '...';
                    dots.style.color = 'rgba(245,245,247,0.4)';
                    dots.style.padding = '0 8px';
                    div.appendChild(dots);
                }
                continue;
            }
            var btn = document.createElement('button');
            btn.className = 'page-btn' + (i === page ? ' active' : '');
            btn.textContent = i;
            (function (pageNum) {
                btn.addEventListener('click', function () { currentPage = pageNum; loadLeads(); });
            })(i);
            div.appendChild(btn);
        }

        var nextBtn = document.createElement('button');
        nextBtn.className = 'page-btn';
        nextBtn.textContent = '下一页';
        nextBtn.disabled = page >= totalPages;
        nextBtn.addEventListener('click', function () { currentPage = page + 1; loadLeads(); });
        div.appendChild(nextBtn);
    }

    document.querySelectorAll('.filter-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
            this.classList.add('active');
            currentFilter = this.getAttribute('data-filter');
            currentPage = 1;
            loadLeads();
        });
    });

    var searchTimer;
    document.getElementById('searchInput').addEventListener('input', function () {
        clearTimeout(searchTimer);
        var val = this.value;
        searchTimer = setTimeout(function () {
            currentSearch = val;
            currentPage = 1;
            loadLeads();
        }, 300);
    });

    window.viewLead = function (id) {
        currentLeadId = id;
        apiRequest('GET', '/leads/' + id, null, function (err, lead) {
            if (err) return;
            var body = document.getElementById('modalBody');
            body.innerHTML =
                '<div class="detail-row"><span class="detail-label">姓名</span><span class="detail-value">' + esc(lead.name) + '</span></div>' +
                '<div class="detail-row"><span class="detail-label">国家</span><span class="detail-value">' + esc(lead.country) + '</span></div>' +
                '<div class="detail-row"><span class="detail-label">邮箱</span><span class="detail-value">' + esc(lead.email) + '</span></div>' +
                '<div class="detail-row"><span class="detail-label">电话</span><span class="detail-value">' + esc(lead.phone) + '</span></div>' +
                '<div class="detail-row"><span class="detail-label">感兴趣产品</span><span class="detail-value">' + esc(lead.interest) + '</span></div>' +
                '<div class="detail-row"><span class="detail-label">状态</span><span class="detail-value"><span class="status-badge ' + lead.status + '">' + statusText(lead.status) + '</span></span></div>' +
                '<div class="detail-row"><span class="detail-label">提交时间</span><span class="detail-value">' + formatDate(lead.createdAt) + '</span></div>' +
                '<div class="detail-row"><span class="detail-label">留言</span></div>' +
                '<div class="detail-message">' + esc(lead.message || '无') + '</div>';

            var statusBtn = document.getElementById('modalStatusBtn');
            if (lead.status === 'new') {
                statusBtn.textContent = '标记已联系';
                statusBtn.style.display = '';
            } else if (lead.status === 'contacted') {
                statusBtn.textContent = '标记已关闭';
                statusBtn.style.display = '';
            } else {
                statusBtn.style.display = 'none';
            }

            document.getElementById('detailModal').classList.remove('hidden');
        });
    };

    document.getElementById('modalStatusBtn').addEventListener('click', function () {
        if (!currentLeadId) return;
        var newStatus = this.textContent.includes('已联系') ? 'contacted' : 'closed';
        apiRequest('PATCH', '/leads/' + currentLeadId, { status: newStatus }, function (err) {
            if (err) return;
            document.getElementById('detailModal').classList.add('hidden');
            loadLeads();
            loadDashboard();
        });
    });

    window.deleteLead = function (id) {
        if (!confirm('确定要删除这条线索吗？')) return;
        apiRequest('DELETE', '/leads/' + id, null, function (err) {
            if (err) return;
            loadLeads();
            loadDashboard();
        });
    };

    document.getElementById('modalClose').addEventListener('click', function () {
        document.getElementById('detailModal').classList.add('hidden');
    });
    document.getElementById('modalCloseBtn').addEventListener('click', function () {
        document.getElementById('detailModal').classList.add('hidden');
    });
    document.querySelector('.modal-overlay').addEventListener('click', function () {
        document.getElementById('detailModal').classList.add('hidden');
    });

    function statusText(s) {
        var map = { 'new': '新线索', 'contacted': '已联系', 'closed': '已关闭' };
        return map[s] || s;
    }

    function formatDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        var pad = function (n) { return n < 10 ? '0' + n : n; };
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }

    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // === Settings: Change Username ===
    document.getElementById('changeUsernameForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var newUsername = document.getElementById('newUsername').value.trim();
        var password = document.getElementById('usernamePassword').value;
        var msgEl = document.getElementById('usernameMsg');

        apiRequest('PATCH', '/admin/username', { newUsername: newUsername, password: password }, function (err, data) {
            msgEl.classList.remove('hidden', 'success', 'error');
            if (err) {
                msgEl.classList.add('error');
                msgEl.textContent = typeof err === 'string' ? err : '修改失败';
                return;
            }
            msgEl.classList.add('success');
            msgEl.textContent = '用户名修改成功！';
            token = data.token;
            localStorage.setItem('admin_token', token);
            adminUsername.textContent = data.username;
            document.getElementById('newUsername').value = '';
            document.getElementById('usernamePassword').value = '';
        });
    });

    // === Settings: Change Password ===
    document.getElementById('changePasswordForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var currentPassword = document.getElementById('currentPassword').value;
        var newPassword = document.getElementById('newPassword').value;
        var confirmPassword = document.getElementById('confirmPassword').value;
        var msgEl = document.getElementById('passwordMsg');

        if (newPassword !== confirmPassword) {
            msgEl.classList.remove('hidden', 'success');
            msgEl.classList.add('error');
            msgEl.textContent = '两次输入的新密码不一致';
            return;
        }

        apiRequest('PATCH', '/admin/password', { currentPassword: currentPassword, newPassword: newPassword }, function (err) {
            msgEl.classList.remove('hidden', 'success', 'error');
            if (err) {
                msgEl.classList.add('error');
                msgEl.textContent = typeof err === 'string' ? err : '修改失败';
                return;
            }
            msgEl.classList.add('success');
            msgEl.textContent = '密码修改成功！请使用新密码重新登录';
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        });
    });

    checkAuth();
})();
