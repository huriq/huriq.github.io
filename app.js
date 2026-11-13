(function() {
    document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
    document.addEventListener('keydown', function(e) {
        if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74 || e.keyCode === 67)) || (e.ctrlKey && e.keyCode === 85)) {
            e.preventDefault();
            return false;
        }
    });
})();

const _securePassHashes = {
    alpha: "7c73b4fafd53d2efb95a092915ce7fe602e5aa2b8ec0ce263d1b0fd066370096", 
    beta:  "90f8e387d7c5e53cf72096776fa3823c4561692b4061de39e1f00ed0642b4851"  
};

async function hashString(str) {
    if (!window.crypto || !window.crypto.subtle) {
        throw new Error(" ، تشفير SHA-256 ما يشتغل على ملف محلي (file://). لازم ترفعه لـ GitHub أو تستخدم Localhost حتى يشتغل نظام الحماية!");
    }
    const encoder = new TextEncoder();
    const data = encoder.encode(str.trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const ENCRYPTION_CONFIG = {
    iterations: 100000,
    hash: "SHA-256",
    length: 256
};

async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
    );

    return window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: ENCRYPTION_CONFIG.iterations,
            hash: ENCRYPTION_CONFIG.hash
        },
        keyMaterial,
        { name: "AES-GCM", length: ENCRYPTION_CONFIG.length },
        false,
        ["encrypt", "decrypt"]
    );
}

async function encryptText(text, password) {
    const encoder = new TextEncoder();
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);

    const encryptedContent = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        encoder.encode(text)
    );

    const encryptedContentArray = new Uint8Array(encryptedContent);
    const buffer = new Uint8Array(salt.length + iv.length + encryptedContentArray.length);

    buffer.set(salt, 0);
    buffer.set(iv, salt.length);
    buffer.set(encryptedContentArray, salt.length + iv.length);

    return btoa(String.fromCharCode.apply(null, buffer));
}

async function decryptText(encryptedBase64, password) {
    try {
        const binaryString = atob(encryptedBase64);
        const buffer = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            buffer[i] = binaryString.charCodeAt(i);
        }

        const salt = buffer.slice(0, 16);
        const iv = buffer.slice(16, 28);
        const encryptedContent = buffer.slice(28);

        const key = await deriveKey(password, salt);

        const decryptedContent = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encryptedContent
        );

        const decoder = new TextDecoder();
        return decoder.decode(decryptedContent);
    } catch (error) {
        return null;
    }
}

const GITHUB_USER = 'huriq'; 
const REPO_NAME = 'huriq.github.io';
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxWqUyDQ3uIdD2hmMy25c9rwCgxSGYsBMGM0FUr9sOeO3msyBB198ndlDLBPbW67FJ0Wg/exec";

let allPostsData = [];
let repliesMap = {}; 
let currentFilter = 'home';
let currentFolderFilter = 'all';
let currentPostId = null; 

let visiblePostsCount = 1;

let currentModalImages = [];
let currentModalIndex = 0;

const urlParams = new URLSearchParams(window.location.search);
const isAdminMode = urlParams.has('admin');
const isHashMode = urlParams.has('hash');

if (isHashMode) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('hash-login-screen').style.display = 'block';
}

var quillAdmin;
let replyEditors = {};

function verifyHashPass() {
    const val = document.getElementById('hash-passcode-input').value;
    if (val === "HasH") {
        document.getElementById('hash-login-screen').style.display = 'none';
        document.getElementById('hash-screen').style.display = 'block';
    } else {
        const errEl = document.getElementById('hash-login-error');
        errEl.style.display = 'block';
    }
}

async function generateLiveHash() {
    const val = document.getElementById('hash-input-text').value;
    const outputEl = document.getElementById('hash-output-result');
    if(!val.trim()) {
        outputEl.innerText = "جاري الانتظار...";
        return;
    }
    try {
        const hashed = await hashString(val);
        outputEl.innerText = hashed;
    } catch(e) {
        outputEl.innerText = "خطأ في توليد الهاش";
    }
}

function copyGeneratedHash() {
    const outputEl = document.getElementById('hash-output-result').innerText;
    if(outputEl && outputEl !== "جاري الانتظار..." && outputEl !== "خطأ في توليد الهاش") {
        navigator.clipboard.writeText(outputEl);
        alert("تم نسخ الهاش بنجاح! 📋✨");
    } else {
        alert("لا يوجد هاش صالح للنسخ!");
    }
}

function toArabicNumbers(str) {
    if (str === null || str === undefined) return '';
    const hindiMap = {'٠':'0', '١':'1', '٢':'2', '٣':'3', '٤':'4', '٥':'5', '٦':'6', '٧':'7', '٨':'8', '٩':'9'};
    return String(str).replace(/[٠-٩]/g, function(d) {
        return hindiMap[d] !== undefined ? hindiMap[d] : d;
    });
}

function updateClockAndDate() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    
    document.getElementById('live-clock').innerText = `⏰ ${String(hours).padStart(2,'0')}:${minutes}:${seconds} ${ampm}`;
    
    const options = { weekday: 'long' };
    const weekday = now.toLocaleDateString('ar-IQ', options);
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    
    document.getElementById('live-date').innerText = `📅 ${weekday}، ${day}/${month}/${year}`;
}
setInterval(updateClockAndDate, 1000);
updateClockAndDate();

function toggleSearchBox() {
    const box = document.getElementById('searchDropdown');
    if (box.style.display === 'block') {
        box.style.display = 'none';
    } else {
        box.style.display = 'block';
        document.getElementById('globalSearchInput').focus();
    }
}

window.addEventListener('click', function(e) {
    const dropdown = document.getElementById('searchDropdown');
    const toggleBtn = document.querySelector('.search-toggle-btn');
    if (dropdown && dropdown.style.display === 'block') {
        if (!dropdown.contains(e.target) && !toggleBtn.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    }
});

async function refreshPlatformContent() {
    await loadPosts();
}

function scrollToTopPage() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function scrollToBottomPage() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function checkScrollNavVisibility(totalCount) {
    const navContainer = document.getElementById('scrollNavContainer');
    if (navContainer) {
        if (totalCount > 5) {
            navContainer.style.display = 'flex';
        } else {
            navContainer.style.display = 'none';
        }
    }
}

function executeGlobalSearch() {
    const query = document.getElementById('globalSearchInput').value.trim().toLowerCase();
    const listContainer = document.getElementById('searchResultsList');
    
    if (!query) {
        listContainer.innerHTML = `<p style="color: var(--text-muted); text-align: center; font-size: 0.85rem; padding: 10px;">اكتب شيئاً للبحث في أرشيف المنصة والردود...</p>`;
        return;
    }

    const searchResults = [];

    allPostsData.forEach((post, idx) => {
        if (!isPostPublished(post)) return;
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = post.content || '';
        const plainText = (tempDiv.textContent || tempDiv.innerText || '').toLowerCase();

        if (plainText.includes(query) || (post.folder && post.folder.toLowerCase().includes(query))) {
            searchResults.push({
                type: 'post',
                idx: idx,
                post: post,
                snippet: plainText.substring(0, 75) + '...'
            });
        }
    });

    Object.keys(repliesMap).forEach(postIdxStr => {
        const pIdx = parseInt(postIdxStr);
        const postReplies = repliesMap[pIdx] || [];
        const post = allPostsData[pIdx];

        if (post && isPostPublished(post)) {
            postReplies.forEach(rep => {
                const tempRepDiv = document.createElement('div');
                tempRepDiv.innerHTML = rep.text || '';
                const repText = (tempRepDiv.textContent || tempRepDiv.innerText || '').toLowerCase();
                const authorLower = (rep.author || '').toLowerCase();

                if (repText.includes(query) || authorLower.includes(query)) {
                    const alreadyAdded = searchResults.some(r => r.type === 'post' && r.idx === pIdx);
                    if (!alreadyAdded) {
                        searchResults.push({
                            type: 'reply',
                            idx: pIdx,
                            post: post,
                            replyAuthor: rep.author,
                            snippet: `رد من (${rep.author}): ${repText.substring(0, 60)}...`
                        });
                    }
                }
            });
        }
    });

    if (searchResults.length === 0) {
        listContainer.innerHTML = `<p style="color: var(--text-muted); text-align: center; font-size: 0.85rem; padding: 10px;">لم يتم العثور على نتائج تطابق بحثك في المنشورات أو الردود.</p>`;
        return;
    }

    let html = '';
    searchResults.forEach(item => {
        const tabName = getTabName(item.post.type || 'home');
        const folderStr = item.post.folder ? ` ◂ ${item.post.folder}` : '';
        const tabSafe = item.post.type || 'home';
        const folderSafe = item.post.folder || 'all';
        const badgeLabel = item.type === 'reply' ? '💬 [نتيجة في الردود] ' : '📄 ';

        html += `
            <div class="search-result-item" onclick="goToSearchResult('${tabSafe}', '${folderSafe}', ${item.idx}, ${item.type === 'reply'})">
                <div class="search-result-breadcrumb">${badgeLabel}${tabName}${folderStr}</div>
                <div class="search-result-snippet">${toArabicNumbers(item.snippet)}</div>
            </div>
        `;
    });

    listContainer.innerHTML = html;
}

function goToSearchResult(tab, folder, id, isReplyMatch) {
    document.getElementById('searchDropdown').style.display = 'none';
    document.getElementById('globalSearchInput').value = '';
    goToPost(tab, folder, id);

    if (isReplyMatch) {
        setTimeout(() => {
            toggleRepliesSection(id);
        }, 400);
    }
}

function initAdminEditor() {
    if(!quillAdmin) {
        quillAdmin = new Quill('#admin-editor', {
            theme: 'snow',
            placeholder: 'اكتب محتوى المنشور هنا...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'color': [] }, { 'background': [] }],
                    [{ 'align': [] }],
                    ['clean']
                ]
            }
        });
    }
}

function handleHash() {
    const hash = window.location.hash.startsWith('#/') ? window.location.hash.substring(2) : '';
    const parts = hash.split('/');
    
    currentFilter = parts[0] || 'home';
    currentFolderFilter = parts[1] ? decodeURIComponent(parts[1]) : 'all';
    currentPostId = parts[2] ? parseInt(parts[2]) : null;

    visiblePostsCount = 1;

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const targetBtn = document.getElementById(`tab-${currentFilter}`);
    if(targetBtn) targetBtn.classList.add('active');

    const backBar = document.getElementById('back-bar');
    backBar.style.display = (currentFilter !== 'home' || currentPostId !== null) ? 'block' : 'none';

    buildSubfolders();
    
    if(allPostsData.length > 0 || isAdminMode === false) renderPosts();
}

window.addEventListener('hashchange', handleHash);

async function verifyPass() {
    const passInput = document.getElementById('passcode-input');
    const errEl = document.getElementById('login-error');
    const val = passInput.value;

    try {
        const inputHash = await hashString(val);
        const targetHash = isAdminMode ? _securePassHashes.beta : _securePassHashes.alpha;

        if(inputHash === targetHash) {
            errEl.style.display = 'none';
            passInput.classList.remove('input-error-anim');
            passInput.classList.add('input-success-glow');

            const card = document.getElementById('login-screen');
            for (let i = 0; i < 6; i++) {
                const heart = document.createElement('div');
                heart.className = 'floating-heart';
                heart.innerHTML = '🩵';
                heart.style.left = (passInput.offsetLeft + Math.random() * passInput.offsetWidth) + 'px';
                heart.style.top = (passInput.offsetTop + 'px');
                heart.style.animationDelay = (i * 0.15) + 's';
                card.appendChild(heart);
                setTimeout(() => heart.remove(), 1200);
            }

            setTimeout(() => {
                const overlay = document.createElement('div');
                overlay.className = 'welcome-overlay';
                overlay.innerHTML = `<div class="welcome-text">أَهْلاً وَمَرحَبًا.. أَيُّهَا الكَائِنُ الأَزرَق🩵</div>`;
                document.body.appendChild(overlay);

                setTimeout(() => {
                    overlay.remove();
                    document.getElementById('login-screen').style.display = 'none';
                    if(isAdminMode) {
                        document.getElementById('admin-panel').style.display = 'block';
                        initAdminEditor();
                        const savedT = localStorage.getItem('hur_gh_token');
                        if(savedT) document.getElementById('gh-token').value = savedT;
                        fetchPostsForAdmin();
                    } else {
                        document.getElementById('content-area').style.display = 'block';
                        loadPosts();
                    }
                }, 2500);
            }, 600);

        } else {
            passInput.classList.remove('input-success-glow');
            passInput.classList.add('input-error-anim');
            errEl.innerText = "عُذرًا أنت لا تملك حق الوصول للبيت الأزرق!";
            errEl.style.display = 'block';
            setTimeout(() => passInput.classList.remove('input-error-anim'), 500);
        }
    } catch (e) {
        errEl.innerText = e.message;
        errEl.style.display = 'block';
    }
}

async function loadPosts() {
    const loader = document.getElementById('main-loader');
    loader.style.display = 'block';
    try {
        const res = await fetch(`https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/posts.json?t=${Date.now()}`);
        if(!res.ok) throw new Error();
        allPostsData = await res.json();
        loader.style.display = 'none';
        handleHash();
        
        loadRepliesIndexedInBackground();
    } catch(e) {
        loader.style.display = 'none';
        allPostsData = [];
        handleHash();
    }
}

async function loadRepliesIndexedInBackground() {
    try {
        const res = await fetch(WEB_APP_URL + "?t=" + Date.now());
        if (res.ok) {
            const list = await res.json();
            repliesMap = {};
            list.forEach(r => {
                const pIdx = parseInt(r.postIndex);
                if (!repliesMap[pIdx]) repliesMap[pIdx] = [];
                repliesMap[pIdx].push(r);
            });
            updateAllRenderedRepliesCount();
        }
    } catch(e) {
        repliesMap = {};
    }
}

function updateAllRenderedRepliesCount() {
    allPostsData.forEach((post, index) => {
        const countBadge = document.getElementById(`replies-count-${index}`);
        if (countBadge) {
            const postReplies = repliesMap[index] || [];
            countBadge.innerText = `(${toArabicNumbers(postReplies.length)})`;
        }
    });
}

function toggleRepliesSection(index) {
    const box = document.getElementById(`replies-box-${index}`);
    const btn = document.getElementById(`replies-toggle-btn-${index}`);
    if (!box || !btn) return;

    const postReplies = repliesMap[index] || [];

    if (box.style.display === 'block') {
        box.style.display = 'none';
        btn.innerText = `💬 عرض الردود والمكاتبات (${toArabicNumbers(postReplies.length)})`;
    } else {
        box.style.display = 'block';
        btn.innerText = `🔽 إخفاء الردود`;
        
        const container = document.getElementById(`replies-list-container-${index}`);
        if (container && container.innerHTML.trim() === '') {
            let html = '';
            if (postReplies.length > 0) {
                postReplies.forEach((rep, repIdx) => {
                    const tempRepDiv = document.createElement('div');
                    tempRepDiv.innerHTML = rep.text || '';
                    const repLen = (tempRepDiv.textContent || tempRepDiv.innerText || '').trim().length;
                    const isRepTrunc = repLen > 150 && currentPostId === null;

                    html += `
                        <div class="reply-item">
                            <div class="reply-author">👤 ${rep.author} <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(${toArabicNumbers(rep.date)})</span></div>
                            <div class="reply-text ${isRepTrunc ? 'truncated' : ''}" id="reply-text-${index}-${repIdx}">${rep.text}</div>
                            <button class="btn-reply-read-more" id="reply-read-btn-${index}-${repIdx}" onclick="toggleReplyReadMore(${index}, ${repIdx})" ${isRepTrunc ? '' : 'style="display:none;"'}>عرض المزيد ▼</button>
                        </div>`;
                });
            } else {
                html = `<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:10px;">لا توجد ردود حتى الآن.</p>`;
            }
            container.innerHTML = html;
        }
    }
}

function switchTab(filter) {
    window.location.hash = '#/' + filter;
}

function filterFolder(folderName) {
    window.location.hash = '#/' + currentFilter + '/' + encodeURIComponent(folderName);
}

function resetToHome() {
    window.location.hash = '#/home';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function goToPost(tab, folder, id) {
    window.location.hash = '#/' + tab + '/' + encodeURIComponent(folder) + '/' + id;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function copyDeepLink(tab, folder, id) {
    const safeFolder = folder ? encodeURIComponent(folder) : 'all';
    const url = window.location.origin + window.location.pathname + `#/${tab}/${safeFolder}/${id}`;
    navigator.clipboard.writeText(url);
    alert("تم نسخ رابط المنشور بنجاح! 📋✨");
}

function getTabName(type) {
    switch(type) {
        case 'home': return 'الصفحة الرئيسية';
        case 'updates': return 'التحديثات';
        case 'beliefs': return 'المعتقدات';
        case 'writings': return 'المكتوبات';
        case 'correspondence': return 'المكاتبات';
        case 'visuals': return 'المرئيات';
        case 'audio': return 'المسموعات';
        case 'separations': return 'الفصلات';
        case 'trash': return 'مُهمل';
        case 'archives': return 'المحفوظات';
        default: return 'الصفحة الرئيسية';
    }
}

function buildSubfolders() {
    const bar = document.getElementById('subfolders-container');
    bar.innerHTML = '';
    
    if (currentPostId !== null) {
        bar.style.display = 'none';
        return;
    }

    const folders = [...new Set(allPostsData.filter(p => (p.type || 'home') === currentFilter && p.folder && isPostPublished(p)).map(p => p.folder))];
    
    if(currentFilter === 'correspondence') {
        if(!folders.includes('مكتوبات الآخرين')) folders.push('مكتوبات الآخرين');
    }
    if(folders.length === 0) {
        bar.style.display = 'none';
        return;
    }
    
    bar.style.display = 'flex';
    bar.innerHTML += `<div class="folder-chip ${currentFolderFilter === 'all' ? 'active' : ''}" onclick="filterFolder('all')">الكل</div>`;
    folders.forEach(f => {
        bar.innerHTML += `<div class="folder-chip ${currentFolderFilter === f ? 'active' : ''}" onclick="filterFolder('${f}')">📂 ${f}</div>`;
    });
}

function getBaghdadCurrentTime() {
    const now = new Date();
    const baghdadTimeStr = now.toLocaleString("en-US", { timeZone: "Asia/Baghdad" });
    return new Date(baghdadTimeStr).getTime();
}

function isPostPublished(post) {
    if (!post.scheduledTime) return true;
    const scheduledLocalStr = post.scheduledTime.replace('T', ' ');
    const scheduledTimeObj = new Date(scheduledLocalStr);
    const scheduledBaghdadStr = scheduledTimeObj.toLocaleString("en-US", { timeZone: "Asia/Baghdad" });
    const scheduledTime = new Date(scheduledBaghdadStr).getTime();
    
    const now = getBaghdadCurrentTime();
    return now >= scheduledTime;
}

function renderHomeTimeline() {
    const feed = document.getElementById('posts-feed');
    feed.innerHTML = '';

    let timelinePosts = allPostsData.map((post, i) => ({...post, realIndex: i}))
                                    .filter(p => isPostPublished(p))
                                    .slice().reverse();

    checkScrollNavVisibility(timelinePosts.length);

    if(timelinePosts.length === 0) {
        feed.innerHTML = `<p class="empty-msg">لا توجد أي منشورات أو أحداث حتى الآن.</p>`;
        return;
    }

    let html = '<div class="timeline-container">';
    
    timelinePosts.forEach(post => {
        const tabName = getTabName(post.type || 'home');
        const folderStr = post.folder ? ` ◂ <span>${post.folder}</span>` : '';
        const tabSafe = post.type || 'home';
        const folderSafe = post.folder || 'all';

        let typeIcon = '🖋️';
        let previewText = 'محتوى نصي...';

        if (post.image) {
            const lowerUrl = post.image.toLowerCase();
            if (lowerUrl.includes('.pdf') || lowerUrl.endsWith('.pdf')) { typeIcon = '📄'; previewText = 'ملف PDF'; }
            else if (lowerUrl.match(/\.(mp3|wav|ogg|m4a|aac|flac)/)) { typeIcon = '🎧'; previewText = 'مقطع صوتي'; }
            else if (lowerUrl.match(/\.(mp4|mov|webm|ogg|m4v|avi|mkv)/)) { typeIcon = '🎬'; previewText = 'ملف فيديو'; }
            else { typeIcon = '🖼️'; previewText = 'مرفق مرئي (صورة)'; }
        }

        if (post.content && post.content.trim() !== '') {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = post.content;
            const plainText = tempDiv.textContent || tempDiv.innerText || '';
            if (plainText.trim() !== '') {
                previewText = plainText.substring(0, 80) + '...';
                typeIcon = '🖋️'; 
                if (post.image) typeIcon += ' / 🖼️';
            }
        }

        html += `
        <div class="timeline-card" onclick="goToPost('${tabSafe}', '${folderSafe}', ${post.realIndex})">
            <div class="timeline-breadcrumb">
                <span>${tabName}</span>${folderStr} ◂ <span>🕒 ${toArabicNumbers(post.date)}</span>
            </div>
            <div class="timeline-preview">
                <span class="type-icon">${typeIcon}</span>
                <span class="preview-text">${toArabicNumbers(previewText)}</span>
            </div>
        </div>
        `;
    });
    
    html += '</div>';
    feed.innerHTML = html;
}

function loadMorePosts() {
    visiblePostsCount += 1;
    renderPosts();
}

function renderPosts() {
    if (currentFilter === 'home' && currentPostId === null && currentFolderFilter === 'all') {
        renderHomeTimeline();
        return;
    }

    const feed = document.getElementById('posts-feed');
    feed.innerHTML = '';

    let filtered = allPostsData.map((post, i) => ({...post, realIndex: i})).filter(p => {
        if (!isPostPublished(p)) return false;
        if (currentPostId !== null) {
            return p.realIndex === currentPostId;
        }
        const t = p.type || 'home';
        if(t !== currentFilter) return false;
        if(currentFolderFilter !== 'all') {
            if(p.folder !== currentFolderFilter) return false;
        }
        return true;
    });

    checkScrollNavVisibility(filtered.length);

    if(filtered.length === 0) {
        feed.innerHTML = `<p class="empty-msg">لا توجد منشورات في هذا القسم حالياً.</p>`;
        return;
    }

    if (currentFilter === 'visuals' && currentPostId === null && currentFolderFilter === 'all') {
        let visualsHtml = '<div class="visuals-masonry">';
        filtered.slice().reverse().forEach((post) => {
            if (post.image) {
                const imgArray = post.image.split(',').map(url => url.trim()).filter(url => url.length > 0);
                imgArray.forEach(imgUrl => {
                    const lower = imgUrl.toLowerCase();
                    if(!lower.match(/\.(mp4|mov|webm|ogg|m4v|avi|mkv)/)) {
                        visualsHtml += `
                            <div class="visual-card" onclick="goToPost('visuals', 'all', ${post.realIndex})">
                                <img src="${imgUrl}" alt="Visual Image" loading="lazy">
                                <div class="visual-card-footer">
                                    <span>🕒 ${toArabicNumbers(post.date)}</span>
                                    <span>🔍 عرض</span>
                                </div>
                            </div>
                        `;
                    }
                });
            }
        });
        visualsHtml += '</div>';
        feed.innerHTML = visualsHtml;
        return;
    }

    const reversedFiltered = filtered.slice().reverse();
    const visibleSlice = reversedFiltered.slice(0, visiblePostsCount);
    const hasMore = visiblePostsCount < reversedFiltered.length;

    visibleSlice.forEach((post) => {
        const typeLabel = getTabName(post.type || 'home');
        const folderTag = post.folder ? ` / 📂 ${post.folder}` : '';
        const tabId = post.type || 'home';
        const isUpdatesTab = (post.type === 'updates');
        
        let html = `
            <div class="post-card" id="post-${post.realIndex}" ${isUpdatesTab ? 'style="border-color: rgba(0, 210, 255, 0.4); background: linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(2, 6, 23, 0.9));"' : ''}>
                <div class="post-header">
                    <div>
                        <span class="post-tag">${typeLabel}${folderTag}</span>
                    </div>
                    <span class="post-date">🕒 ${toArabicNumbers(post.date)}</span>
                </div>`;
        
        if(post.image) {
            const mediaItems = post.image.split(',').map(url => url.trim()).filter(url => url.length > 0);
            
            mediaItems.forEach(mediaUrl => {
                const lowerUrl = mediaUrl.toLowerCase();
                
                if(lowerUrl.endsWith('.pdf') || lowerUrl.includes('.pdf?')) {
                    html += `
                        <div style="width: 100%; height: 500px; border-radius: 12px; overflow: hidden; border: 1px solid var(--border); margin-bottom: 15px;">
                            <iframe src="${mediaUrl}#view=FitH" width="100%" height="100%" style="border: none;"></iframe>
                        </div>
                        <div style="margin-bottom: 15px; text-align: left;">
                            <a href="${mediaUrl}" target="_blank" style="color: var(--primary); font-size: 0.9rem; text-decoration: underline;">📄 فتح ملف الـ PDF في نافذة مستقلة أو تحميله</a>
                        </div>
                    `;
                } else if(lowerUrl.match(/\.(mp3|wav|ogg|m4a|aac|flac)/) || lowerUrl.includes('.mp3?') || lowerUrl.includes('.m4a?')) {
                    html += `
                        <div style="margin-bottom: 15px; background: rgba(2, 6, 23, 0.6); padding: 15px; border-radius: 12px; border: 1px solid var(--border);">
                            <audio controls style="width: 100%;">
                                <source src="${mediaUrl}">
                                متصفحك لا يدعم مشغل الصوت.
                            </audio>
                            <div style="margin-top: 8px; text-align: left;">
                                <a href="${mediaUrl}" target="_blank" style="color: var(--primary); font-size: 0.85rem; text-decoration: underline;">🎧 تحميل أو فتح الملف الصوتي</a>
                            </div>
                        </div>
                    `;
                } else if(lowerUrl.match(/\.(mp4|mov|webm|ogg|m4v|avi|mkv)/)) {
                    html += `
                        <div style="margin-bottom: 15px; background: rgba(2, 6, 23, 0.6); padding: 15px; border-radius: 12px; border: 1px solid var(--border);">
                            <video controls playsinline style="width: 100%; border-radius: 8px; max-height: 450px;">
                                <source src="${mediaUrl}">
                                متصفحك لا يدعم مشغل الفيديو.
                            </video>
                            <div style="margin-top: 8px; text-align: left;">
                                <a href="${mediaUrl}" target="_blank" style="color: var(--primary); font-size: 0.85rem; text-decoration: underline;">🎬 تحميل أو فتح ملف الفيديو</a>
                            </div>
                        </div>
                    `;
                }
            });

            const imageItems = mediaItems.filter(url => {
                const l = url.toLowerCase();
                return !l.match(/\.(pdf|mp3|wav|ogg|m4a|aac|flac|mp4|mov|webm|m4v|avi|mkv)/) && !l.includes('.pdf?') && !l.includes('.mp3?');
            });

            if (imageItems.length === 1) {
                html += `<img src="${imageItems[0]}" class="post-image" alt="Post Image" onclick="openImageModal('${imageItems[0]}', ${JSON.stringify(imageItems).replace(/"/g, '&quot;')})">`;
            } else if (imageItems.length > 1) {
                const countClass = imageItems.length > 4 ? 'count-more' : `count-${imageItems.length}`;
                html += `<div class="post-images-grid ${countClass}">`;
                
                imageItems.slice(0, 4).forEach((imgUrl, imgIdx) => {
                    const arrJson = JSON.stringify(imageItems).replace(/"/g, '&quot;');
                    if (imgIdx === 3 && imageItems.length > 4) {
                        html += `
                            <div class="grid-more-wrapper" onclick="openImageModal('${imgUrl}', ${arrJson})">
                                <img src="${imgUrl}" alt="Post Image">
                                <div class="grid-more-overlay">+${toArabicNumbers(imageItems.length - 4)} صور</div>
                            </div>
                        `;
                    } else {
                        html += `<img src="${imgUrl}" alt="Post Image" onclick="openImageModal('${imgUrl}', ${arrJson})">`;
                    }
                });
                
                html += `</div>`;
            }
        }

        if(post.content) {
            const tempPostDiv = document.createElement('div');
            tempPostDiv.innerHTML = post.content;
            const plainLen = (tempPostDiv.textContent || tempPostDiv.innerText || '').trim().length;
            const isTruncated = plainLen > 250 && currentPostId === null;

            html += `
                <div class="post-body ${isTruncated ? 'truncated' : ''}" id="post-body-${post.realIndex}">${post.content}</div>
                <button class="btn-read-more" id="read-more-btn-${post.realIndex}" onclick="toggleReadMore(${post.realIndex})" ${isTruncated ? '' : 'style="display:none;"'}>عرض المزيد ▼</button>
            `;
        }

        html += `
            <div class="post-footer-actions">
                <button class="btn-copy-link-fakhfakha" onclick="copyDeepLink('${tabId}', '${post.folder || ''}', ${post.realIndex})">
                    <span>🔗</span> نسخ رابط المنشور
                </button>
            </div>
        `;

        if (!isUpdatesTab) {
            const postReplies = repliesMap[post.realIndex] || [];
            const repliesCount = postReplies.length;

            html += `
                <div class="replies-section">
                    <button class="btn-reply-toggle" id="replies-toggle-btn-${post.realIndex}" onclick="toggleRepliesSection(${post.realIndex})">
                        💬 عرض الردود والمكاتبات <span id="replies-count-${post.realIndex}">(${toArabicNumbers(repliesCount)})</span>
                    </button>
                    <div id="replies-box-${post.realIndex}" style="display: none; margin-top: 15px;">
                        <div id="replies-list-container-${post.realIndex}"></div>
                    </div>
                </div>
            `;

            html += `
                <button class="btn-reply-toggle" onclick="toggleReplyForm(${post.realIndex})" style="margin-top:10px;">✍️ كتابة مكتوب أو رد</button>
                <div class="reply-form-box" id="reply-form-${post.realIndex}">
                    <input type="text" id="reply-author-${post.realIndex}" placeholder="اسمك الكريم..." style="margin-bottom:10px; padding:10px; font-size:0.9rem;">
                    
                    <div class="editor-container reply-editor-container">
                        <div id="reply-editor-${post.realIndex}"></div>
                    </div>

                    <button id="reply-btn-${post.realIndex}" onclick="submitPublicReply(${post.realIndex})" style="padding:10px; font-size:0.95rem;">إرسال المكتوب</button>
                </div>
            `;
        }

        feed.innerHTML += html;
    });

    if (hasMore) {
        feed.innerHTML += `
            <div style="text-align: center; margin: 30px 0;">
                <button onclick="loadMorePosts()" style="background: linear-gradient(135deg, var(--primary), var(--secondary)); color: #070b19; padding: 14px 28px; border-radius: 16px; font-weight: 700; font-family: 'Tajawal', sans-serif; font-size: 1.05rem; box-shadow: 0 5px 20px rgba(0, 210, 255, 0.3); cursor: pointer; width: auto; display: inline-flex; align-items: center; gap: 10px;">
                    <span>📥</span> إظهار المزيد من المنشورات (${toArabicNumbers(reversedFiltered.length - visiblePostsCount)} متبقي)
                </button>
            </div>
        `;
    }
}

function toggleReadMore(index) {
    const bodyEl = document.getElementById(`post-body-${index}`);
    const btnEl = document.getElementById(`read-more-btn-${index}`);
    if(!bodyEl || !btnEl) return;

    if(bodyEl.classList.contains('truncated')) {
        bodyEl.classList.remove('truncated');
        btnEl.innerText = "إخفاء التفاصيل ▲";
    } else {
        bodyEl.classList.add('truncated');
        btnEl.innerText = "عرض المزيد ▼";
    }
}

function toggleReplyReadMore(postIndex, repIdx) {
    const textEl = document.getElementById(`reply-text-${postIndex}-${repIdx}`);
    const btnEl = document.getElementById(`reply-read-btn-${postIndex}-${repIdx}`);
    if(!textEl || !btnEl) return;

    if(textEl.classList.contains('truncated')) {
        textEl.classList.remove('truncated');
        btnEl.innerText = "إخفاء التفاصيل ▲";
    } else {
        textEl.classList.add('truncated');
        btnEl.innerText = "عرض المزيد ▼";
    }
}

async function refreshRepliesForPost(postIndex) {
    await loadRepliesIndexedInBackground();
}

function toggleReplyForm(index) {
    const box = document.getElementById(`reply-form-${index}`);
    if (box.style.display === 'block') {
        box.style.display = 'none';
    } else {
        box.style.display = 'block';
        if (!replyEditors[index]) {
            setTimeout(() => {
                replyEditors[index] = new Quill(`#reply-editor-${index}`, {
                    theme: 'snow',
                    placeholder: 'اكتب مكتوبك هنا ونسقه براحتك...',
                    modules: {
                        toolbar: [
                            ['bold', 'italic', 'underline'],
                            [{ 'color': [] }],
                            [{ 'align': [] }],
                            ['clean']
                        ]
                    }
                });
            }, 50);
        }
    }
}

async function submitPublicReply(index) {
    const author = document.getElementById(`reply-author-${index}`).value.trim();
    const textHTML = replyEditors[index] ? replyEditors[index].root.innerHTML : '';
    const textPlain = replyEditors[index] ? replyEditors[index].getText().trim() : '';

    if(!author || textPlain.length === 0) {
        alert("حبيبي، يرجى كتابة الاسم والمحتوى!");
        return;
    }

    const btn = document.getElementById(`reply-btn-${index}`);
    btn.innerText = "جاري إرسال المكتوب...";
    btn.disabled = true;

    const now = new Date();
    const formattedDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}`;

    try {
        const payload = {
            author: author,
            postIndex: index,
            message: textHTML,
            date: formattedDate
        };

        await fetch(WEB_APP_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(payload)
        });
        
        alert("تم إرسال مكتوبك بنجاح!");
        if(replyEditors[index]) replyEditors[index].root.innerHTML = '';
        document.getElementById(`reply-author-${index}`).value = '';
        toggleReplyForm(index);
        refreshRepliesForPost(index);
    } catch(e) {
        alert("حدثت مشكلة في الاتصال.");
    } finally {
        btn.innerText = "إرسال المكتوب";
        btn.disabled = false;
    }
}

function openImageModal(url, imagesList) {
    currentModalImages = imagesList || [url];
    currentModalIndex = currentModalImages.indexOf(url);
    if (currentModalIndex === -1) currentModalIndex = 0;
    
    updateModalImageDisplay();
    document.getElementById('imgModal').style.display = 'flex';
}

function updateModalImageDisplay() {
    if (currentModalImages.length > 0) {
        document.getElementById('modalImgSrc').src = currentModalImages[currentModalIndex];
    }
}

function slideModalImages(direction) {
    if (currentModalImages.length <= 1) return;
    currentModalIndex += direction;
    if (currentModalIndex >= currentModalImages.length) {
        currentModalIndex = 0;
    } else if (currentModalIndex < 0) {
        currentModalIndex = currentModalImages.length - 1;
    }
    updateModalImageDisplay();
}

function closeImageModal() {
    document.getElementById('imgModal').style.display = 'none';
}

async function uploadDirectAsset(folderName) {
    const fileInput = document.getElementById('direct-file-input');
    const token = document.getElementById('gh-token').value.trim();
    const statusMsg = document.getElementById('upload-status-msg');

    if (!token) {
        alert('يرجى إدخال GitHub Token في الحقل المخصص أولاً!');
        return;
    }

    if (!fileInput || fileInput.files.length === 0) {
        alert('الرجاء اختيار ملف، صورة أو فيديو من جهازك أولاً!');
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();
    
    statusMsg.style.color = "var(--warning)";
    statusMsg.innerText = "جاري رفع الملف إلى GitHub...";

    reader.onload = async function() {
        try {
            const base64Content = reader.result.split(',')[1];
            const fileName = Date.now() + '_' + file.name.replace(/\s+/g, '_');
            const path = `uploads/${folderName}/${fileName}`;
            const url = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/${path}`;
            
            const payload = {
                message: `Upload ${fileName} via HUR Platform`,
                content: base64Content,
                branch: 'main'
            };

            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok) {
                const rawUrl = `https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/${path}`;
                const currentVal = document.getElementById('post-image-url').value.trim();
                document.getElementById('post-image-url').value = currentVal ? currentVal + ', ' + rawUrl : rawUrl;
                statusMsg.style.color = "var(--success)";
                statusMsg.innerText = "✅ تم رفع الملف بنجاح وإضافته للرابط!";
                fileInput.value = '';
            } else {
                statusMsg.style.color = "var(--error)";
                statusMsg.innerText = 'فشل الرفع: ' + (data.message || 'خطأ غير معروف');
            }
        } catch (error) {
            statusMsg.style.color = "var(--error)";
            statusMsg.innerText = 'حدث خطأ في الاتصال أثناء الرفع.';
        }
    };
    reader.readAsDataURL(file);
}

async function fetchPostsForAdmin() {
    const loader = document.getElementById('admin-loader');
    const listContainer = document.getElementById('manage-posts-list');
    loader.style.display = 'block';

    try {
        const res = await fetch(`https://raw.githubusercontent.com/${GITHUB_USER}/${REPO_NAME}/main/posts.json?t=${Date.now()}`);
        if(!res.ok) throw new Error();
        allPostsData = await res.json();
        loader.style.display = 'none';
        renderAdminList();
    } catch(e) {
        loader.style.display = 'none';
        allPostsData = [];
        listContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">قائمة المنشورات فارغة.</p>';
    }
}

function renderAdminList() {
    const listContainer = document.getElementById('manage-posts-list');
    listContainer.innerHTML = '';

    if(!allPostsData || allPostsData.length === 0) {
        listContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">قائمة المنشورات فارغة.</p>';
        return;
    }

    allPostsData.map((post, index) => ({ ...post, realIndex: index })).slice().reverse().forEach(item => {
        const snippet = item.content ? item.content.replace(/<[^>]*>/g, '').substring(0, 50) + '...' : '[ملف / صورة / فيديو / صوت]';
        const tLabel = getTabName(item.type || 'home');
        const fLabel = item.folder ? ` [فولدر: ${item.folder}]` : '';
        
        let scheduleBadge = '';
        if (item.scheduledTime) {
            const scheduledLocalStr = item.scheduledTime.replace('T', ' ');
            const scheduledTimeObj = new Date(scheduledLocalStr);
            const scheduledBaghdadStr = scheduledTimeObj.toLocaleString("en-US", { timeZone: "Asia/Baghdad" });
            const isScheduledActive = getBaghdadCurrentTime() < new Date(scheduledBaghdadStr).getTime();
            
            if (isScheduledActive) {
                scheduleBadge = ` <span style="color: var(--warning); font-size: 0.75rem;">(⏳ مجدول لـ: ${toArabicNumbers(item.scheduledTime.replace('T', ' '))})</span>`;
            } else {
                scheduleBadge = ` <span style="color: var(--success); font-size: 0.75rem;">(✅ منشور مجدول)</span>`;
            }
        }

        listContainer.innerHTML += `
            <div class="manage-item">
                <div class="manage-info">
                    <div class="manage-text"><strong>[${tLabel}${fLabel}]</strong>: ${toArabicNumbers(snippet)} ${scheduleBadge}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${toArabicNumbers(item.date)}</div>
                </div>
                <div class="manage-actions">
                    <button class="btn-edit" onclick="prepareEdit(${item.realIndex})">تعديل</button>
                    <button class="btn-delete" onclick="deletePost(${item.realIndex})">حذف</button>
                </div>
            </div>`;
    });
}

function prepareEdit(index) {
    const post = allPostsData[index];
    document.getElementById('edit-index').value = index;
    document.getElementById('post-type').value = post.type || 'home';
    document.getElementById('post-folder').value = post.folder || '';
    
    if (quillAdmin) quillAdmin.root.innerHTML = post.content || '';
    document.getElementById('post-image-url').value = post.image || '';
    document.getElementById('post-scheduled-time').value = post.scheduledTime || '';
    
    const pubBtn = document.getElementById('publish-btn');
    pubBtn.innerText = "💾 حفظ التعديلات";
    document.getElementById('cancel-edit-btn').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cancelEdit() {
    document.getElementById('edit-index').value = "-1";
    document.getElementById('post-folder').value = '';
    if(quillAdmin) quillAdmin.root.innerHTML = '';
    document.getElementById('post-image-url').value = '';
    document.getElementById('post-scheduled-time').value = '';
    document.getElementById('publish-btn').innerText = "🚀 نشر أو جدول المحتوى";
    document.getElementById('cancel-edit-btn').style.display = 'none';
}

async function saveOrUpdatePost() {
    const token = document.getElementById('gh-token').value.trim();
    const editIndex = parseInt(document.getElementById('edit-index').value);
    const type = document.getElementById('post-type').value;
    const folder = document.getElementById('post-folder').value.trim();
    
    const contentHTML = quillAdmin.root.innerHTML;
    const isContentEmpty = quillAdmin.getText().trim().length === 0;

    const image = document.getElementById('post-image-url').value.trim();
    const scheduledTime = document.getElementById('post-scheduled-time').value.trim();
    
    const btn = document.getElementById('publish-btn');
    const feedback = document.getElementById('admin-feedback');

    if(!token) {
        feedback.style.color = "var(--error)";
        feedback.innerText = "الرجاء إدخال الـ GitHub Token!";
        return;
    }

    if(isContentEmpty && !image) {
        feedback.style.color = "var(--error)";
        feedback.innerText = "أدخل نصاً أو رابط صورة/ملف على الأقل!";
        return;
    }

    localStorage.setItem('hur_gh_token', token);
    btn.disabled = true;
    btn.innerText = "جاري التحديث في المستودع...";
    feedback.innerText = "";

    const apiUrl = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/posts.json`;

    const now = new Date();
    let targetDateObj = now;
    if (scheduledTime) {
        targetDateObj = new Date(scheduledTime.replace('T', ' '));
    }
    
    const formattedDate = `${String(targetDateObj.getDate()).padStart(2, '0')}/${String(targetDateObj.getMonth() + 1).padStart(2, '0')}/${targetDateObj.getFullYear()} ${targetDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}`;

    try {
        const getRes = await fetch(apiUrl, { headers: { 'Authorization': `token ${token}` } });
        let sha = null;
        let existing = [];

        if(getRes.ok) {
            const fileData = await getRes.json();
            sha = fileData.sha;
            if(fileData.content) {
                existing = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(fileData.content), c => c.charCodeAt(0))));
            }
        }

        let commitMsg = "";
        if(editIndex >= 0)  {
            existing[editIndex] = {
                type: type,
                folder: folder,
                content: isContentEmpty ? "" : contentHTML,
                image: image,
                scheduledTime: scheduledTime || null,
                date: formattedDate,
                replies: existing[editIndex].replies || []
            };
            commitMsg = `Update post index ${editIndex}`;
        } else {
            existing.push({
                type: type,
                folder: folder,
                content: isContentEmpty ? "" : contentHTML,
                image: image,
                scheduledTime: scheduledTime || null,
                date: formattedDate,
                replies: []
            });
            commitMsg = `Add new ${type} post (scheduled)`;
        }

        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(existing, null, 2))));

        const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: commitMsg, content: encoded, sha: sha })
        });

        if(!putRes.ok) throw new Error("فشل حفظ التحديث في المستودع.");

        feedback.style.color = "var(--success)";
        feedback.innerText = editIndex >= 0 ? "✅ تم تحديث المنشور بنجاح!" : (scheduledTime ? "⏳ تم جدولـة المنشور بنجاح!" : "✅ تم نشر المحتوى بنجاح!");
        
        cancelEdit();
        fetchPostsForAdmin();

    } catch(err) {
        feedback.style.color = "var(--error)";
        feedback.innerText = "❌ خطأ: " + err.message;
    } finally {
        btn.disabled = false;
        if(document.getElementById('edit-index').value == "-1") {
            btn.innerText = "🚀 نشر أو جدول المحتوى";
        }
    }
}

async function deletePost(index) {
    if(!confirm("هل أنت متأكد من حذف هذا المنشور نهائياً؟")) return;

    const token = document.getElementById('gh-token').value.trim();
    const feedback = document.getElementById('admin-feedback');

    if(!token) {
        alert("الرجاء إدخال الـ GitHub Token أولاً!");
        return;
    }

    const apiUrl = `https://api.github.com/repos/${GITHUB_USER}/${REPO_NAME}/contents/posts.json`;

    try {
        const getRes = await fetch(apiUrl, { headers: { 'Authorization': `token ${token}` } });
        if(!getRes.ok) throw new Error("فشل الاتصال بـ GitHub.");
        
        fileData = await getRes.json();
        let existing = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(fileData.content), c => c.charCodeAt(0))));

        existing.splice(index, 1);
        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(existing, null, 2))));

        const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message: `Delete post index ${index}`, content: encoded, sha: fileData.sha })
        });

        if(!putRes.ok) throw new Error("فشل الحذف من المستودع.");

        feedback.style.color = "var(--success)";
        feedback.innerText = "🗑️ تم حذف المنشور بنجاح!";
        fetchPostsForAdmin();

    } catch(err) {
        feedback.style.color = "var(--error)";
        feedback.innerText = "❌ خطأ بالحذف: " + err.message;
    }
}

setInterval(() => {
    if (allPostsData.length > 0 && !isAdminMode) {
        let hasChanges = false;
        const nowBaghdad = getBaghdadCurrentTime();
        allPostsData.forEach(p => {
            if (p.scheduledTime) {
                const scheduledLocalStr = p.scheduledTime.replace('T', ' ');
                const scheduledTimeObj = new Date(scheduledLocalStr);
                const scheduledBaghdadStr = scheduledTimeObj.toLocaleString("en-US", { timeZone: "Asia/Baghdad" });
                const sTime = new Date(scheduledBaghdadStr).getTime();
                
                if (nowBaghdad >= sTime && !p._wasRenderedActive) {
                    p._wasRenderedActive = true;
                    hasChanges = true;
                }
            }
        });
        if (hasChanges) {
            renderPosts();
        }
    }
}, 1000);
