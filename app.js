/**
 * Lumina Read - Premium Audio Articles
 * Core Logic & TTS Engine
 */

class LuminaApp {
    constructor() {
        this.currentArticle = null;
        this.library = JSON.parse(localStorage.getItem('lumina_library')) || [];
        this.synth = window.speechSynthesis;
        this.utterance = null;
        this.isPlaying = false;
        this.rate = 1.0;
        this.voices = [];
        this.timer = null;
        this.elapsed = 0;

        // DOM Elements
        this.urlInput = document.getElementById('urlInput');
        this.clearInputBtn = document.getElementById('clearInputBtn');
        this.extractBtn = document.getElementById('extractBtn');
        
        // New File Elements
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.linkInputContainer = document.getElementById('linkInputContainer');
        this.fileInputContainer = document.getElementById('fileInputContainer');
        this.fileInput = document.getElementById('fileInput');
        this.browseBtn = document.getElementById('browseBtn');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.fileNameDisplay = document.getElementById('fileNameDisplay');
        this.welcomeView = document.getElementById('welcomeView');
        this.articleDisplay = document.getElementById('articleDisplay');
        this.articleTitle = document.getElementById('articleTitle');
        this.articleContent = document.getElementById('articleContent');
        this.articleSource = document.getElementById('articleSource');
        this.articleReadingTime = document.getElementById('articleReadingTime');
        this.playerBar = document.getElementById('playerBar');
        this.playerTitle = document.getElementById('playerTitle');
        this.playerAuthor = document.getElementById('playerAuthor');
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.progressFill = document.getElementById('progressFill');
        this.currentTime = document.getElementById('currentTime');
        this.totalTime = document.getElementById('totalTime');
        this.voiceSelect = document.getElementById('voiceSelect');
        this.langSelect = document.getElementById('langSelect');
        this.translateBtn = document.getElementById('translateBtn');
        this.speedBtn = document.getElementById('speedBtn');
        this.libraryList = document.getElementById('libraryList');
        this.clearLibraryBtn = document.getElementById('clearLibrary');
        this.toast = document.getElementById('toast');

        this.init();
    }

    init() {
        // Tab Switching
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => this.switchMode(btn.dataset.mode));
        });

        // Event Listeners
        this.extractBtn.addEventListener('click', () => this.handleExtract());
        this.urlInput.addEventListener('keypress', (e) => e.key === 'Enter' && this.handleExtract());
        this.clearInputBtn.addEventListener('click', () => {
            this.urlInput.value = '';
            this.urlInput.focus();
        });

        // File Handlers
        this.browseBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        this.uploadBtn.addEventListener('click', () => this.handleFileUpload());
        
        // Translation
        this.translateBtn.addEventListener('click', () => this.handleTranslate());
        this.langSelect.addEventListener('change', () => {
            if (this.langSelect.value === 'en' && this.currentArticle && this.currentArticle.originalText) {
                this.restoreOriginal();
            }
        });
        this.playPauseBtn.addEventListener('click', () => this.togglePlayback());
        this.speedBtn.addEventListener('click', () => this.cycleSpeed());
        this.clearLibraryBtn.addEventListener('click', () => this.clearLibrary());
        this.voiceSelect.addEventListener('change', () => this.updateVoice());
        
        // Rewind / Skip
        document.getElementById('rewindBtn').addEventListener('click', () => this.skip(-10));
        document.getElementById('skipBtn').addEventListener('click', () => this.skip(10));

        // Load Voices
        this.loadVoices();
        if (this.synth.onvoiceschanged !== undefined) {
            this.synth.onvoiceschanged = () => this.loadVoices();
        }

        this.renderLibrary();
    }

    // --- Core Logic ---

    async handleExtract() {
        const url = this.urlInput.value.trim();
        if (!url) return this.showToast('Please enter a valid URL');

        this.setLoading(true);
        try {
            console.log(`Attempting to extract: ${url}`);
            const article = await this.fetchArticle(url);
            this.displayArticle(article);
            this.addToLibrary(article);
            this.urlInput.value = '';
            this.showToast('Article extracted successfully!');
        } catch (error) {
            console.error('Extraction Error:', error);
            const msg = error.message.includes('CORS') 
                ? 'Security block: Please run the app from a local server.' 
                : `Extraction failed: ${error.message}`;
            this.showToast(msg);
        } finally {
            this.setLoading(false);
        }
    }

    async fetchArticle(url) {
        // Basic URL validation
        try { new URL(url); } catch(e) { throw new Error('Invalid URL format'); }

        const proxies = [
            (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
            (u) => `https://api.codetabs.com/v1/proxy?quest=${u}`,
            (u) => `https://thingproxy.freeboard.io/fetch/${u}`
        ];

        let lastError = null;

        for (const getProxyUrl of proxies) {
            const proxyUrl = getProxyUrl(url);
            try {
                console.log(`Trying proxy: ${proxyUrl}`);
                const response = await fetch(proxyUrl);
                
                if (!response.ok) throw new Error(`Proxy returned ${response.status}`);
                
                const data = await response.json();
                // Handle different proxy response formats
                const html = data.contents || data.content || data;
                
                if (!html) throw new Error('Empty response');

                const doc = new DOMParser().parseFromString(html, 'text/html');
                const reader = new Readability(doc);
                const article = reader.parse();

                if (article && article.textContent && article.textContent.length > 100) {
                    return {
                        title: article.title,
                        content: article.content,
                        textContent: article.textContent,
                        excerpt: article.excerpt,
                        byline: article.byline || new URL(url).hostname,
                        url: url,
                        siteName: article.siteName || new URL(url).hostname,
                        readingTime: Math.ceil(article.textContent.split(/\s+/).length / 200)
                    };
                }
            } catch (e) {
                console.warn(`Proxy failed: ${getProxyUrl.name || 'anonymous'}`, e);
                lastError = e;
                if (window.location.protocol === 'file:') {
                    throw new Error('CORS block: You MUST run this app from a local server (e.g., http://localhost:8000). Browsers block "file://" links from extracting content.');
                }
            }
        }

        throw new Error(lastError ? lastError.message : 'All proxies failed. The website might be blocking extraction.');
    }

    displayArticle(article) {
        this.currentArticle = article;
        
        // Update UI
        this.welcomeView.style.display = 'none';
        this.articleDisplay.style.display = 'block';
        
        this.articleTitle.textContent = article.title;
        this.articleContent.innerHTML = article.content;
        this.articleSource.textContent = article.siteName;
        this.articleReadingTime.textContent = `${article.readingTime} min read`;
        
        // Update Player
        this.playerTitle.textContent = article.title;
        this.playerAuthor.textContent = article.byline;
        this.totalTime.textContent = `${article.readingTime}:00`;
        
        // Stop current speech
        this.stopSpeech();
        
        // Scroll to top
        document.querySelector('.reader-view').scrollTo({ top: 0, behavior: 'smooth' });
    }

    // --- File Handling ---

    switchMode(mode) {
        this.tabBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));
        this.linkInputContainer.style.display = mode === 'link' ? 'flex' : 'none';
        this.fileInputContainer.style.display = mode === 'file' ? 'flex' : 'none';
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.fileNameDisplay.textContent = file.name;
            this.uploadBtn.disabled = false;
        }
    }

    async handleFileUpload() {
        const file = this.fileInput.files[0];
        if (!file) return;

        this.setLoading(true, 'uploadBtn');
        try {
            let text = '';
            const extension = file.name.split('.').pop().toLowerCase();

            if (extension === 'pdf') {
                text = await this.parsePDF(file);
            } else if (extension === 'docx') {
                text = await this.parseDOCX(file);
            } else {
                text = await file.text();
            }

            const article = {
                title: file.name.replace(/\.[^/.]+$/, ""),
                content: text.split('\n').map(p => `<p>${p}</p>`).join(''),
                textContent: text,
                byline: 'Local File',
                url: 'file://' + file.name,
                siteName: 'Document',
                readingTime: Math.ceil(text.split(/\s+/).length / 200)
            };

            this.displayArticle(article);
            this.addToLibrary(article);
            this.showToast('Document processed successfully!');
        } catch (error) {
            console.error(error);
            this.showToast('Failed to parse file: ' + error.message);
        } finally {
            this.setLoading(false, 'uploadBtn');
        }
    }

    async parsePDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const pageText = content.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
        }
        
        return fullText;
    }

    async parseDOCX(file) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value;
    }

    // --- Translation ---

    async handleTranslate() {
        if (!this.currentArticle) return this.showToast('Extract an article first');
        const targetLang = this.langSelect.value;
        if (targetLang === 'en') return this.showToast('Already in English');

        this.setLoading(true, 'translateBtn');
        try {
            // Save original if not already saved
            if (!this.currentArticle.originalText) {
                this.currentArticle.originalText = this.currentArticle.textContent;
                this.currentArticle.originalTitle = this.currentArticle.title;
            }

            const translatedText = await this.translateText(this.currentArticle.originalText, 'en', targetLang);
            const translatedTitle = await this.translateText(this.currentArticle.originalTitle, 'en', targetLang);

            this.currentArticle.title = translatedTitle;
            this.currentArticle.textContent = translatedText;
            this.currentArticle.content = translatedText.split('\n').map(p => `<p>${p}</p>`).join('');

            this.displayArticle(this.currentArticle);
            this.showToast(`Translated to ${this.langSelect.options[this.langSelect.selectedIndex].text}`);
            
            // Auto-select a voice for the target language
            this.autoSelectVoice(targetLang);
        } catch (error) {
            console.error(error);
            this.showToast('Translation failed: ' + error.message);
        } finally {
            this.setLoading(false, 'translateBtn');
        }
    }

    async translateText(text, from, to) {
        // MyMemory API has a limit on text length per request (~500 chars for free).
        // Providing an email improves rate limits.
        const chunks = this.splitTextIntoChunks(text, 500);
        const email = 'donmaston09@gmail.com';
        
        try {
            const translatedChunks = await Promise.all(chunks.map(async (chunk) => {
                const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${from}|${to}&de=${email}`;
                const response = await fetch(url);
                if (!response.ok) throw new Error('Translation service error');
                const data = await response.json();
                if (data.responseStatus !== 200) throw new Error(data.responseDetails);
                return data.responseData.translatedText;
            }));
            return translatedChunks.join(' ');
        } catch (e) {
            console.error('Translation failed:', e);
            throw new Error('Translation service is temporarily unavailable or limit reached.');
        }
    }

    splitTextIntoChunks(text, maxSize) {
        const chunks = [];
        let i = 0;
        while (i < text.length) {
            chunks.push(text.slice(i, i + maxSize));
            i += maxSize;
        }
        return chunks;
    }

    restoreOriginal() {
        this.currentArticle.title = this.currentArticle.originalTitle;
        this.currentArticle.textContent = this.currentArticle.originalText;
        this.currentArticle.content = this.currentArticle.originalText.split('\n').map(p => `<p>${p}</p>`).join('');
        this.displayArticle(this.currentArticle);
        this.showToast('Restored original English');
    }

    autoSelectVoice(langCode) {
        const voiceIdx = this.voices.findIndex(v => v.lang.startsWith(langCode));
        if (voiceIdx !== -1) {
            this.voiceSelect.value = voiceIdx;
        }
    }

    // --- TTS Engine ---

    togglePlayback() {
        if (!this.currentArticle) return this.showToast('No article selected');

        if (this.isPlaying) {
            this.pauseSpeech();
        } else {
            this.startSpeech();
        }
    }

    startSpeech() {
        if (this.synth.paused) {
            this.synth.resume();
            this.isPlaying = true;
            this.updatePlayerUI();
            return;
        }

        this.stopSpeech();

        // Split text into paragraphs to avoid long utterance issues
        const text = this.currentArticle.textContent;
        this.utterance = new SpeechSynthesisUtterance(text);
        this.utterance.rate = this.rate;
        
        const selectedVoiceIndex = this.voiceSelect.value;
        if (this.voices[selectedVoiceIndex]) {
            this.utterance.voice = this.voices[selectedVoiceIndex];
        }

        this.utterance.onstart = () => {
            this.isPlaying = true;
            this.updatePlayerUI();
            this.startTimer();
        };

        this.utterance.onend = () => {
            this.isPlaying = false;
            this.updatePlayerUI();
            this.stopTimer();
            this.elapsed = 0;
            this.progressFill.style.width = '0%';
        };

        this.utterance.onerror = (e) => {
            console.error('Speech error:', e);
            this.isPlaying = false;
            this.updatePlayerUI();
        };

        // Word boundary highlighting
        this.utterance.onboundary = (event) => {
            if (event.name === 'word') {
                // Future: Implement visual word highlighting in the DOM
            }
        };

        this.synth.speak(this.utterance);
    }

    pauseSpeech() {
        this.synth.pause();
        this.isPlaying = false;
        this.updatePlayerUI();
        this.stopTimer();
    }

    stopSpeech() {
        this.synth.cancel();
        this.isPlaying = false;
        this.updatePlayerUI();
        this.stopTimer();
        this.elapsed = 0;
    }

    skip(seconds) {
        // SpeechSynthesis doesn't natively support seeking easily.
        // For a premium feel, we would need to rebuild the utterance from a new offset.
        // For now, we show a toast that this is a placeholder.
        this.showToast('Skipping...');
        // Logic: cancel, calculate word offset, and restart. 
        // Complex to implement perfectly without a word-map.
    }

    cycleSpeed() {
        const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
        let currentIdx = speeds.indexOf(this.rate);
        this.rate = speeds[(currentIdx + 1) % speeds.length];
        this.speedBtn.textContent = `${this.rate}x`;
        
        if (this.isPlaying) {
            // Restart with new rate
            this.startSpeech();
        }
    }

    loadVoices() {
        const allVoices = this.synth.getVoices();
        // Sort to put high-quality voices first
        this.voices = allVoices.sort((a, b) => {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            const aPremium = aName.includes('premium') || aName.includes('neural') || aName.includes('google') || aName.includes('enhanced');
            const bPremium = bName.includes('premium') || bName.includes('neural') || bName.includes('google') || bName.includes('enhanced');
            if (aPremium && !bPremium) return -1;
            if (!aPremium && bPremium) return 1;
            return 0;
        });

        const groups = {
            'Premium / Neural': this.voices.filter(v => v.name.toLowerCase().includes('premium') || v.name.toLowerCase().includes('neural') || v.name.toLowerCase().includes('google') || v.name.toLowerCase().includes('enhanced')),
            'Nigeria': this.voices.filter(v => v.lang.includes('NG')),
            'United Kingdom': this.voices.filter(v => v.lang.includes('GB')),
            'United States': this.voices.filter(v => v.lang.includes('US')),
            'India': this.voices.filter(v => v.lang.includes('IN')),
            'French': this.voices.filter(v => v.lang.startsWith('fr')),
            'Italian': this.voices.filter(v => v.lang.startsWith('it')),
            'Hausa/Yoruba': this.voices.filter(v => v.lang.startsWith('ha') || v.lang.startsWith('yo')),
            'Others': this.voices.filter(v => 
                !v.lang.includes('NG') && !v.lang.includes('GB') && 
                !v.lang.includes('US') && !v.lang.includes('IN') &&
                !v.lang.startsWith('fr') && !v.lang.startsWith('it') &&
                !v.name.toLowerCase().includes('premium') && !v.name.toLowerCase().includes('neural') &&
                v.lang.startsWith('en')
            )
        };

        let html = '';
        for (const [name, list] of Object.entries(groups)) {
            if (list.length > 0) {
                html += `<optgroup label="${name}">`;
                list.forEach(v => {
                    const idx = allVoices.indexOf(v);
                    const gender = v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('samantha') || v.name.toLowerCase().includes('victoria') ? '♀' : '♂';
                    html += `<option value="${idx}">${v.name} ${gender}</option>`;
                });
                html += `</optgroup>`;
            }
        }

        if (!html) {
            html = allVoices.filter(v => v.lang.startsWith('en')).map((v, i) => 
                `<option value="${allVoices.indexOf(v)}">${v.name}</option>`
            ).join('');
        }

        this.voiceSelect.innerHTML = html;
    }

    updateVoice() {
        if (this.isPlaying) this.startSpeech();
    }

    // --- UI Helpers ---

    updatePlayerUI() {
        const icon = this.playPauseBtn.querySelector('i');
        if (this.isPlaying) {
            icon.className = 'ph-fill ph-pause';
            this.playerBar.classList.add('playing');
        } else {
            icon.className = 'ph-fill ph-play';
            this.playerBar.classList.remove('playing');
        }
    }

    setLoading(isLoading, btnId = 'extractBtn') {
        const btn = document.getElementById(btnId);
        btn.disabled = isLoading;
        btn.querySelector('span').textContent = isLoading ? 'Working...' : (btnId === 'extractBtn' ? 'Extract' : 'Extract Text');
        const icon = btn.querySelector('i');
        icon.className = isLoading ? 'ph ph-circle-notch animate-spin' : (btnId === 'extractBtn' ? 'ph ph-arrow-right' : 'ph ph-sparkle');
        
        btn.style.opacity = isLoading ? '0.7' : '1';
    }

    showToast(msg) {
        this.toast.textContent = msg;
        this.toast.classList.add('show');
        setTimeout(() => this.toast.classList.remove('show'), 3000);
    }

    startTimer() {
        this.stopTimer();
        this.timer = setInterval(() => {
            if (this.isPlaying) {
                this.elapsed++;
                this.updateProgress();
            }
        }, 1000);
    }

    stopTimer() {
        if (this.timer) clearInterval(this.timer);
    }

    updateProgress() {
        const totalSecs = (this.currentArticle?.readingTime || 1) * 60;
        const pct = (this.elapsed / totalSecs) * 100;
        this.progressFill.style.width = `${Math.min(pct, 100)}%`;
        
        const m = Math.floor(this.elapsed / 60);
        const s = this.elapsed % 60;
        this.currentTime.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    // --- Library ---

    addToLibrary(article) {
        // Remove duplicates
        this.library = this.library.filter(item => item.url !== article.url);
        this.library.unshift(article);
        if (this.library.length > 20) this.library.pop();
        
        localStorage.setItem('lumina_library', JSON.stringify(this.library));
        this.renderLibrary();
    }

    renderLibrary() {
        if (this.library.length === 0) {
            this.libraryList.innerHTML = `
                <div class="empty-state">
                    <i class="ph ph-bookmarks"></i>
                    <p>No saved articles yet</p>
                </div>
            `;
            return;
        }

        this.libraryList.innerHTML = this.library.map((item, index) => `
            <div class="library-item ${this.currentArticle?.url === item.url ? 'active' : ''}" data-index="${index}">
                <div class="lib-title">${item.title}</div>
                <div class="lib-meta">${item.siteName} • ${item.readingTime}m</div>
            </div>
        `).join('');

        // Add click events
        this.libraryList.querySelectorAll('.library-item').forEach(el => {
            el.addEventListener('click', () => {
                const idx = el.getAttribute('data-index');
                this.displayArticle(this.library[idx]);
                this.renderLibrary();
            });
        });
    }

    clearLibrary() {
        if (confirm('Clear your library?')) {
            this.library = [];
            localStorage.removeItem('lumina_library');
            this.renderLibrary();
            this.showToast('Library cleared');
        }
    }
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    window.lumina = new LuminaApp();
});
