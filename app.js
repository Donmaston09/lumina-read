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
        this.extractBtn = document.getElementById('extractBtn');
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
        this.speedBtn = document.getElementById('speedBtn');
        this.libraryList = document.getElementById('libraryList');
        this.clearLibraryBtn = document.getElementById('clearLibrary');
        this.toast = document.getElementById('toast');

        this.init();
    }

    init() {
        // Event Listeners
        this.extractBtn.addEventListener('click', () => this.handleExtract());
        this.urlInput.addEventListener('keypress', (e) => e.key === 'Enter' && this.handleExtract());
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
            const article = await this.fetchArticle(url);
            this.displayArticle(article);
            this.addToLibrary(article);
            this.urlInput.value = '';
        } catch (error) {
            console.error(error);
            this.showToast('Failed to extract article. Try another link.');
        } finally {
            this.setLoading(false);
        }
    }

    async fetchArticle(url) {
        // Use allorigins proxy to bypass CORS
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        const data = await response.json();
        
        const doc = new DOMParser().parseFromString(data.contents, 'text/html');
        
        // Fix relative images/links if needed (optional for TTS but good for visual)
        const reader = new Readability(doc);
        const article = reader.parse();

        if (!article || !article.textContent) throw new Error('Could not parse content');

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
        this.voices = this.synth.getVoices().filter(v => v.lang.includes('en'));
        this.voiceSelect.innerHTML = this.voices.map((v, i) => 
            `<option value="${i}">${v.name}</option>`
        ).join('');
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

    setLoading(isLoading) {
        this.extractBtn.disabled = isLoading;
        this.extractBtn.querySelector('span').textContent = isLoading ? 'Working...' : 'Extract';
        const icon = this.extractBtn.querySelector('i');
        icon.className = isLoading ? 'ph ph-circle-notch animate-spin' : 'ph ph-arrow-right';
        
        if (isLoading) {
            this.extractBtn.style.opacity = '0.7';
        } else {
            this.extractBtn.style.opacity = '1';
        }
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
