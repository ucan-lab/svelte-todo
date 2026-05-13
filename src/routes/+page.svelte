<script lang="ts">
	import { onMount } from 'svelte';

	// ── Data ──────────────────────────────────────────────
	const THEMES = [
		{ id: 1,  title: '10年後の就活のあるべき姿を実現するサービスを考えよ', difficulty: '難',  tag: 'サービス立案', isNew: false },
		{ id: 2,  title: 'イノベーションとはなにか？', difficulty: '超難', tag: '抽象テーマ',  isNew: false },
		{ id: 3,  title: 'Sansanのデータを活用した新規事業を設計しなさい', difficulty: '難',  tag: '新規事業',   isNew: false },
		{ id: 4,  title: '10年後の働き方のあるべき姿とは？', difficulty: '普通', tag: '抽象テーマ',  isNew: false },
		{ id: 5,  title: '中小企業のDXを推進するためのサービスを提案せよ', difficulty: '普通', tag: 'サービス立案', isNew: false },
		{ id: 6,  title: '名刺がなくなった時代にSansanが提供できる新たな価値とは？', difficulty: '難',  tag: '新規事業',   isNew: true },
		{ id: 7,  title: 'AIが普及した社会における「人脈」のあるべき姿とは？', difficulty: '超難', tag: '抽象テーマ',  isNew: true },
		{ id: 8,  title: '副業・フリーランスが当たり前の時代の人脈管理サービスを提案せよ', difficulty: '普通', tag: 'サービス立案', isNew: true },
		{ id: 9,  title: 'Sansanのデータを活用して採用市場を変えるサービスを設計せよ', difficulty: '難',  tag: '新規事業',   isNew: true },
		{ id: 10, title: '地方中小企業のビジネスネットワークを活性化する方法を考えよ', difficulty: '普通', tag: 'サービス立案', isNew: true },
	];
	const PHASES = ['定義・論点整理', '課題分析', 'アイデア出し', '結論まとめ'];
	const PHASE_COLORS = ['#4f8ef7', '#9b6cf7', '#e8873a', '#2cb67d'];
	const DIFF_COLORS: Record<string, string> = { '普通': '#2cb67d', '難': '#e8873a', '超難': '#e84393' };
	const TAG_COLORS: Record<string, string> = { 'サービス立案': '#4f8ef7', '抽象テーマ': '#9b6cf7', '新規事業': '#2cb67d' };
	const FALLBACKS = [
		'なるほど、そのご意見は参考になりますね。私は少し違う視点で、現状の課題をもう少し具体的に整理してみてはどうかと思います。',
		'おっしゃる通りですね。ただ、実現可能性という点でもう少し掘り下げられると良いかもしれません。',
		'面白いアイデアだと思います！ターゲットを絞るとより説得力が増しそうですね。どうでしょうか？',
		'その点は重要だと思います。グループとしての結論をまとめる方向に進めてみましょうか。',
		'なるほど。では課題の優先順位をつけるとしたら、どれが一番重要でしょうか？',
		'少し視点を変えると、利用者側のメリットをもっと強調できそうですね。いかがでしょうか？',
	];
	const TRANS_FALLBACKS = [
		'では課題分析に移りましょう。現状どんな問題があるか整理してみましょうか。',
		'アイデア出しのフェーズですね！どんどん案を出していきましょう。',
		'そろそろ結論をまとめる段階ですね。これまでの議論を振り返ると…',
	];

	// ── State ──────────────────────────────────────────────
	type Screen = 'top' | 'select' | 'practice' | 'feedback';
	type Message = { role: 'user' | 'assistant'; content: string; phase: number };
	type Theme = typeof THEMES[0];
	type FeedbackData = {
		score: number; rank: string; rankMsg: string;
		good: string; impr: string; rewrite: string; sansan: string; advice: string; theme: string;
	};

	let apiKey = $state('');
	let apiKeyInput = $state('');
	let showApiModal = $state(true);
	let mode = $state<'chat' | 'voice'>('chat');
	let screen = $state<Screen>('top');
	let currentTheme = $state<Theme | null>(null);
	let phase = $state(0);
	let messages = $state<Message[]>([]);
	let loading = $state(false);
	let timerVal = $state(0);
	let timerInterval = $state<ReturnType<typeof setInterval> | null>(null);
	let chatInputVal = $state('');
	let voiceState = $state<'idle' | 'listening'>('idle');
	let liveText = $state('');
	let recognition = $state<any>(null);
	let feedbackData = $state<FeedbackData | null>(null);
	let feedbackLoading = $state(false);
	let chatArea = $state<HTMLElement | null>(null);
	let apiError = $state('');
	let coachMessages = $state<{ role: 'user' | 'assistant'; content: string }[]>([]);
	let coachInput = $state('');
	let coachLoading = $state(false);
	let coachArea = $state<HTMLElement | null>(null);

	// ── Derived ──────────────────────────────────────────────
	let phaseColor = $derived(PHASE_COLORS[phase]);
	let nextPhaseName = $derived(phase < 3 ? PHASES[phase + 1] : '');
	let timerDisplay = $derived(() => {
		const m = String(Math.floor(timerVal / 60)).padStart(2, '0');
		const s = String(timerVal % 60).padStart(2, '0');
		return `⏱ ${m}:${s}`;
	});

	onMount(() => {
		const saved = localStorage.getItem('sansan_gd_apikey');
		if (saved) { apiKey = saved; showApiModal = false; }
	});

	// ── API Key ──────────────────────────────────────────────
	function saveApiKey() {
		if (apiKeyInput.trim()) {
			apiKey = apiKeyInput.trim();
			localStorage.setItem('sansan_gd_apikey', apiKey);
		}
		showApiModal = false;
	}
	function skipApiKey() { showApiModal = false; }

	// ── Claude API ──────────────────────────────────────────
	async function askAI(system: string, msgs: { role: 'user' | 'assistant'; content: string }[]): Promise<string> {
		if (!apiKey) throw new Error('no key');
		const res = await fetch('/api/chat', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ apiKey, system, messages: msgs }),
		});
		if (!res.ok) {
			const body = await res.text();
			throw new Error(`${res.status} ${body}`);
		}
		const data = await res.json();
		return data.text;
	}

	type AiPayload = { system: string; msgs: { role: 'user' | 'assistant'; content: string }[] };

	function makePrompt(theme: string, ph: string, history: Message[], userMsg: string): AiPayload {
		const system = `あなたはSansanのグループディスカッションに参加している就活生です。
テーマ：「${theme}」
現フェーズ：「${ph}」

ルール：
・必ず自分の意見・アイデア・根拠を述べる（「〜だと思います、なぜなら〜」）
・相手の発言に賛成・反対・補足のどれかの立場を明確にとる
・フェーズを意識する（定義→定義提案、課題分析→問題点指摘、アイデア出し→具体案提示、結論→整理）
・ときどき他メンバーに質問する（「〜についてはどうお考えですか？」）
・2〜3文で簡潔に。就活生らしい丁寧な話し言葉。日本語のみ。発言内容だけ返す。`;

		const msgs: { role: 'user' | 'assistant'; content: string }[] = [
			...history.map(m => ({ role: m.role === 'user' ? 'user' as const : 'assistant' as const, content: m.content })),
			{ role: 'user', content: userMsg },
		];

		return { system, msgs };
	}

	function makeFeedbackPrompt(theme: string, history: Message[]): AiPayload {
		const system = `あなたはSansanの就活GD練習コーチです。ユーザーのGD発言を分析し、以下の形式で詳しくフィードバックしてください。就活コーチとして親切・丁寧に日本語で答えてください。

【総合スコア】XX点 / ランク：X（S/A/B/C）
一行でランク評価
━━━━━━━━━━━━━━━
✅ 良かった点
━━━━━━━━━━━━━━━
（具体的に箇条書き）
━━━━━━━━━━━━━━━
🔧 改善点
━━━━━━━━━━━━━━━
（具体的に箇条書き）
━━━━━━━━━━━━━━━
✏️ 発言の具体的な言い換え例
━━━━━━━━━━━━━━━
実際の発言を2〜3つ引用し以下の形式で：
【元の発言】「（引用）」
→【改善案】「（より良い言い方）」
💡（理由を一言）
━━━━━━━━━━━━━━━
🎯 Sansanの評価ポイントとの照らし合わせ
━━━━━━━━━━━━━━━
（Sansanのミッション・選考傾向と照らし合わせて）
━━━━━━━━━━━━━━━
📝 次回へのアドバイス
━━━━━━━━━━━━━━━
（具体的なアドバイス）`;

		const hist = history.filter(m => m.role === 'user').map((m, i) => `発言${i + 1}：${m.content}`).join('\n');
		const msgs = [{ role: 'user' as const, content: `テーマ：「${theme}」\nユーザーの発言一覧：\n${hist}` }];
		return { system, msgs };
	}

	// ── Local Feedback ──────────────────────────────────────
	function generateLocalFeedback(themeName: string, msgs: Message[]): FeedbackData {
		const userMsgs = msgs.filter(m => m.role === 'user');
		const count = userMsgs.length;
		const allText = userMsgs.map(m => m.content).join(' ');
		const avgLen = count > 0 ? Math.round(allText.length / count) : 0;
		const has = (re: RegExp) => re.test(allText);

		const hasDefinition = has(/定義|とは|意味|考え|定める/);
		const hasStructure = has(/まず|次に|整理|論点|課題|ポイント|観点/);
		const hasQuestion = has(/[？?]|でしょうか|ですか|どう思/);
		const hasSansan = has(/Sansan|サンサン|名刺|データ|出会い|ミッション/);
		const hasConcrete = has(/具体的|例えば|たとえば|実際|数字|割合/);
		const hasConclusion = has(/結論|まとめ|つまり|最終的|以上/);

		let score = 40;
		if (count >= 3) score += 10;
		if (count >= 6) score += 5;
		if (avgLen >= 30) score += 5;
		if (avgLen >= 60) score += 5;
		if (hasDefinition) score += 8;
		if (hasStructure) score += 7;
		if (hasQuestion) score += 5;
		if (hasSansan) score += 7;
		if (hasConcrete) score += 8;
		if (hasConclusion) score += 5;
		score = Math.min(score, 98);

		const rank = score >= 85 ? 'S' : score >= 70 ? 'A' : score >= 55 ? 'B' : 'C';
		const rankMsgs: Record<string, string> = {
			S: '非常に優秀！Sansan通過レベル🎉', A: '良い練習でした！あと少しで通過圏✨',
			B: '基礎はできています。もう一歩！💪', C: '練習を重ねればきっと伸びます📈',
		};

		const good: string[] = [], impr: string[] = [];
		if (count >= 4) good.push(`・${count}回発言できており、参加姿勢が◎`);
		else impr.push(`・発言回数が${count}回と少なめ。もっと積極的に意見を出しましょう`);
		if (hasDefinition) good.push('・定義から入る発言ができており、論理的思考が伝わっています');
		else impr.push('・「〇〇をこう定義します」という定義の提示が少なかったです');
		if (hasStructure) good.push('・「まず〜」「次に〜」など構造的に話せています');
		else impr.push('・論点や課題を「①②③」と整理して話すと評価が上がります');
		if (hasQuestion) good.push('・メンバーへの問いかけができており、議論を活性化できています');
		else impr.push('・「〜はどうでしょうか？」など他者への問いかけを増やしましょう');
		if (hasSansan) good.push('・SansanのミッションをGDに絡めることができています（企業理解◎）');
		else impr.push('・Sansanのミッション「出会いからイノベーションを生み出す」に絡めた発言があると◎');
		if (hasConcrete) good.push('・具体例を使って説明できています');
		else impr.push('・「例えば〜」「具体的には〜」と具体例を添えると説得力が増します');
		if (avgLen >= 50) good.push(`・1発言の平均${avgLen}字と適切な長さです`);
		else if (avgLen > 0) impr.push(`・1発言が平均${avgLen}字と短め。もう少し丁寧に説明しましょう`);

		const rewriteExamples = userMsgs.slice(0, 2).map(m => {
			const orig = m.content;
			let improved = orig;
			if (!hasStructure) improved = `まず論点を整理すると、${orig}という点が重要だと思います。`;
			else if (!hasDefinition) improved = `「${orig.slice(0, 10)}…」を定義すると〇〇と捉えられ、${orig}という議論につながります。`;
			else if (!hasQuestion) improved = `${orig} 皆さんはこの点についてどうお考えでしょうか？`;
			return `【元の発言】「${orig}」\n→【改善案】「${improved}」\n💡 構造・定義・問いかけを意識するとより評価されます`;
		}).join('\n\n');

		return {
			score, rank, rankMsg: rankMsgs[rank],
			good: good.length ? good.join('\n') : '・発言内容から良い点を検出できませんでした',
			impr: impr.length ? impr.join('\n') : '・特に大きな改善点はありませんでした',
			rewrite: userMsgs.length > 0 ? rewriteExamples : '・発言がないため言い換え例を生成できませんでした',
			sansan: `Sansanが見ているのは「発言量」ではなく「議論への貢献度」です。\n${hasStructure ? '論点整理ができていた点は「論理的思考力」に合致しています。' : '論点整理の発言を増やすと「論理的思考力」のアピールになります。'}\n${hasDefinition ? '定義から入る習慣はGDの王道で、Sansanでも高く評価されます。' : '「定義から入る」習慣をつけると、抽象テーマでもスムーズに議論できます。'}`,
			advice: score >= 70
				? '全体的に良い練習でした！次は「フェーズを意識した発言」（定義→課題→アイデア→結論）をより明確にすることを意識してみましょう。'
				: 'まずは「①定義→②課題→③解決策→④結論」の4ステップを意識して練習しましょう。発言の型ができれば自信もつきます。',
			theme: themeName,
		};
	}

	function parseAIFeedback(raw: string, theme: string): FeedbackData {
		const scoreM = raw.match(/(\d+)点/);
		const rankM = raw.match(/ランク：([SABC])/);
		const score = scoreM ? parseInt(scoreM[1]) : 65;
		const rank = rankM ? rankM[1] : 'B';
		const rankMsgs: Record<string, string> = {
			S: '非常に優秀！Sansan通過レベル🎉', A: '良い練習でした！あと少しで通過圏✨',
			B: '基礎はできています。もう一歩！💪', C: '練習を重ねればきっと伸びます📈',
		};
		const extract = (emoji: string) => {
			const re = new RegExp(`${emoji}[^━]*\\n━+\\n([\\s\\S]*?)(?=━━|$)`);
			const m = raw.match(re);
			return m ? m[1].trim() : '';
		};
		return {
			score, rank, rankMsg: rankMsgs[rank] || '',
			good: extract('✅') || '（取得できませんでした）',
			impr: extract('🔧') || '（取得できませんでした）',
			rewrite: extract('✏️') || '（取得できませんでした）',
			sansan: extract('🎯') || raw,
			advice: extract('📝') || '',
			theme,
		};
	}

	// ── Timer ──────────────────────────────────────────────
	function startTimer() {
		timerInterval = setInterval(() => { timerVal++; }, 1000);
	}
	function stopTimer() {
		if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
	}
	function fmtTime(s: number) {
		return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
	}

	// ── Practice ──────────────────────────────────────────
	async function startPractice(t: Theme) {
		currentTheme = t;
		phase = 0;
		messages = [];
		timerVal = 0;
		feedbackData = null;
		screen = 'practice';
		startTimer();
		loading = true;

		let reply: string;
		try {
			const p0 = makePrompt(t.title, PHASES[0], [], 'GDを始めます。最初の一言をお願いします。');
			reply = await askAI(p0.system, p0.msgs);
		} catch {
			reply = 'こんにちは！GDを始めましょう。まず今日のテーマの定義から確認したいのですが、いかがでしょうか？';
		}
		messages = [...messages, { role: 'assistant', content: reply, phase: 0 }];
		loading = false;
		scrollChat();
	}

	async function sendChat() {
		const text = chatInputVal.trim();
		if (!text || loading) return;
		chatInputVal = '';
		await processUserTurn(text);
	}

	async function processUserTurn(text: string) {
		messages = [...messages, { role: 'user', content: text, phase }];
		loading = true;
		scrollChat();

		let reply: string;
		try {
			const p1 = makePrompt(currentTheme!.title, PHASES[phase], messages.slice(0, -1), text);
			reply = await askAI(p1.system, p1.msgs);
			apiError = '';
		} catch (e: any) {
			apiError = !apiKey ? 'APIキーが未入力です（固定応答モード）' : `API接続エラー：${e?.message ?? e}`;
			reply = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
		}
		messages = [...messages, { role: 'assistant', content: reply, phase }];
		loading = false;
		scrollChat();
	}

	async function nextPhase() {
		if (loading) return;
		if (phase >= 3) {
			stopTimer();
			screen = 'feedback';
			feedbackLoading = true;
			try {
				const fp = makeFeedbackPrompt(currentTheme!.title, messages);
				const raw = await askAI(fp.system, fp.msgs);
				feedbackData = parseAIFeedback(raw, currentTheme!.title);
			} catch {
				feedbackData = generateLocalFeedback(currentTheme!.title, messages);
			}
			feedbackLoading = false;
			return;
		}
		phase++;
		loading = true;
		let reply: string;
		try {
			const p2 = makePrompt(currentTheme!.title, PHASES[phase], messages, `フェーズを「${PHASES[phase]}」に移ります。一言お願いします。`);
			reply = await askAI(p2.system, p2.msgs);
		} catch {
			reply = TRANS_FALLBACKS[Math.min(phase - 1, TRANS_FALLBACKS.length - 1)];
		}
		messages = [...messages, { role: 'assistant', content: reply, phase }];
		loading = false;
		scrollChat();
	}

	function scrollChat() {
		setTimeout(() => {
			if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
		}, 50);
	}

	function restart() {
		screen = 'select'; messages = []; phase = 0; timerVal = 0;
		coachMessages = []; coachInput = '';
	}

	function makeCoachPayload(): AiPayload {
		const gdHistory = messages.map(m =>
			`${m.role === 'user' ? 'ユーザー' : 'AIメンバー'}：${m.content}`
		).join('\n');
		const fb = feedbackData;
		const fbSummary = fb
			? `スコア：${fb.score}点 / ランク：${fb.rank}\n良かった点：${fb.good}\n改善点：${fb.impr}\nアドバイス：${fb.advice}`
			: '';
		const system = `あなたはSansanのGD練習コーチです。
ユーザーは「${currentTheme?.title}」というテーマでGD練習を行いました。

【GDの会話記録】
${gdHistory}

【フィードバック結果】
${fbSummary}

上記を踏まえて、ユーザーの質問や相談に親切・具体的に答えてください。
改善案を聞かれたら実際の発言を引用して言い換え例を示してください。
日本語のみ。就活コーチとして丁寧に。`;
		return { system, msgs: coachMessages };
	}

	async function sendCoach() {
		const text = coachInput.trim();
		if (!text || coachLoading) return;
		coachInput = '';
		coachMessages = [...coachMessages, { role: 'user', content: text }];
		coachLoading = true;
		setTimeout(() => { if (coachArea) coachArea.scrollTop = coachArea.scrollHeight; }, 50);

		let reply: string;
		try {
			const p = makeCoachPayload();
			reply = await askAI(p.system, p.msgs);
		} catch {
			reply = 'すみません、うまく返答できませんでした。もう一度試してください。';
		}
		coachMessages = [...coachMessages, { role: 'assistant', content: reply }];
		coachLoading = false;
		setTimeout(() => { if (coachArea) coachArea.scrollTop = coachArea.scrollHeight; }, 50);
	}

	// ── Voice ──────────────────────────────────────────────
	function startListening() {
		if (voiceState !== 'idle' || loading) return;
		const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		if (!SR) { alert('音声認識非対応。Chromeをお使いください。'); return; }
		const rec = new SR();
		rec.lang = 'ja-JP'; rec.continuous = false; rec.interimResults = true;
		rec.onstart = () => { voiceState = 'listening'; };
		rec.onresult = (e: any) => {
			liveText = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join('');
		};
		rec.onend = () => {
			const text = liveText;
			liveText = '';
			voiceState = 'idle';
			recognition = null;
			if (text.trim()) processUserTurn(text.trim());
		};
		rec.onerror = () => { voiceState = 'idle'; liveText = ''; recognition = null; };
		recognition = rec;
		rec.start();
	}

	function stopListening() { if (recognition) recognition.stop(); }

	function escHtml(s: string) {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
	}
</script>

<!-- API Key Modal -->
{#if showApiModal}
<div class="modal-overlay">
  <div class="modal-box">
    <h2>🔑 APIキーを入力</h2>
    <p>AIメンバーを動かすにはAnthropicのAPIキーが必要です。キーはブラウザ内にのみ保存され、外部には送信されません。</p>
    <input type="password" bind:value={apiKeyInput} placeholder="sk-ant-..." />
    <p class="note">
      ※ APIキーは console.anthropic.com で取得できます。<br>
      ※ キーなしでも練習は可能ですが、AI応答が固定文になります。
    </p>
    <button class="btn-primary" onclick={saveApiKey}>保存して始める</button>
    <button class="btn-skip" onclick={skipApiKey}>APIキーなしで続ける（固定応答モード）</button>
  </div>
</div>
{/if}

<!-- TOP -->
{#if screen === 'top'}
<div class="screen top-screen">
  <div class="top-inner">
    <div class="logo">💬</div>
    <h1 class="top-title">Sansan GD 練習</h1>
    <p class="top-sub">AIメンバーとリアルなGDを練習。<br>チャットモードは授業中の内職にも◎</p>
    <div class="mode-card">
      <p class="mode-label">モード選択</p>
      <div class="mode-btns">
        <button class="mode-btn" class:active={mode === 'chat'} onclick={() => mode = 'chat'}>
          <div class="icon">⌨️</div>
          <div class="lbl">チャット</div>
          <div class="sub">内職に◎</div>
        </button>
        <button class="mode-btn" class:active={mode === 'voice'} onclick={() => mode = 'voice'}>
          <div class="icon">🎙️</div>
          <div class="lbl">音声</div>
          <div class="sub">Chrome限定</div>
        </button>
      </div>
    </div>
    <button class="btn-primary" onclick={() => screen = 'select'}>練習を始める →</button>
  </div>
</div>

<!-- SELECT -->
{:else if screen === 'select'}
<div class="screen select-screen">
  <button class="back-btn" onclick={() => screen = 'top'}>← 戻る</button>
  <h2 class="sel-title">テーマを選択</h2>
  <p class="sel-sub">Sansanの過去GDテーマ ／ {mode === 'chat' ? '⌨️ チャット' : '🎙️ 音声'}</p>
  <div class="theme-list">
    {#each THEMES as t}
      <button class="theme-card" onclick={() => startPractice(t)}>
        <div class="theme-tags">
          <span class="pill" style="background:{TAG_COLORS[t.tag] ?? '#4f8ef7'}22;color:{TAG_COLORS[t.tag] ?? '#4f8ef7'}">{t.tag}</span>
          <div style="display:flex;gap:6px;align-items:center">
            {#if t.isNew}
              <span class="pill" style="background:#e84393;color:#fff;font-weight:bold">NEW</span>
            {/if}
            <span class="pill" style="background:{DIFF_COLORS[t.difficulty]}22;color:{DIFF_COLORS[t.difficulty]}">難易度：{t.difficulty}</span>
          </div>
        </div>
        <p class="theme-text">{t.title}</p>
      </button>
    {/each}
  </div>
</div>

<!-- PRACTICE -->
{:else if screen === 'practice'}
<div class="screen practice-screen">
  <div class="practice-header">
    <div class="header-row">
      <span class="timer-txt">{timerDisplay()}</span>
      <span class="phase-pill" style="background:{phaseColor}22;color:{phaseColor}">{PHASES[phase]}</span>
      <span class="mode-icon">{mode === 'chat' ? '⌨️' : '🎙️'}</span>
    </div>
    <div class="phase-bar">
      {#each PHASES as _, i}
        <div class="phase-seg" style="background:{i <= phase ? PHASE_COLORS[i] : 'rgba(255,255,255,0.1)'}"></div>
      {/each}
    </div>
    <p class="theme-hint">📋 {currentTheme?.title}</p>
    {#if apiError}
      <p class="api-error-hint">⚠️ {apiError} — <button onclick={() => { showApiModal = true; }} style="background:none;border:none;color:#f7a248;cursor:pointer;font-size:11px;padding:0;text-decoration:underline">APIキーを設定</button></p>
    {/if}
  </div>

  <div class="chat-area" bind:this={chatArea}>
    {#each messages as msg}
      {#if msg.role === 'assistant'}
        <div class="msg-row ai">
          <div class="avatar" style="background:linear-gradient(135deg,{PHASE_COLORS[msg.phase]},{PHASE_COLORS[(msg.phase+1)%4]})">🤖</div>
          <div class="bubble ai">
            <div class="ai-label">AIメンバー</div>
            {@html escHtml(msg.content)}
          </div>
        </div>
      {:else}
        <div class="msg-row user">
          <div class="bubble user" style="background:linear-gradient(135deg,{PHASE_COLORS[msg.phase]},{PHASE_COLORS[(msg.phase+1)%4]})">{@html escHtml(msg.content)}</div>
          <div class="avatar" style="background:rgba(255,255,255,0.1)">🙋</div>
        </div>
      {/if}
    {/each}
    {#if loading}
      <div class="msg-row ai">
        <div class="avatar" style="background:linear-gradient(135deg,{phaseColor},{PHASE_COLORS[(phase+1)%4]})">🤖</div>
        <div class="thinking blink">考え中...</div>
      </div>
    {/if}
  </div>

  <div class="input-area">
    {#if mode === 'chat'}
      <div class="chat-input-row">
        <input
          class="chat-input"
          bind:value={chatInputVal}
          placeholder="発言を入力… (Enter で送信)"
          disabled={loading}
          onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
        />
        <button class="send-btn" disabled={loading} onclick={sendChat}>送信</button>
      </div>
    {:else}
      <div class="voice-row">
        <span class="voice-status" class:recording={voiceState === 'listening'}>
          {voiceState === 'listening' ? (liveText ? `🎙 ${liveText}` : '● 録音中…') : 'タップして話してください'}
        </span>
        <button
          class="mic-btn"
          class:recording={voiceState === 'listening'}
          disabled={loading}
          onclick={() => voiceState === 'listening' ? stopListening() : startListening()}
        >
          {voiceState === 'listening' ? '⏹' : '🎙️'}
        </button>
      </div>
    {/if}
    <button class="next-btn" disabled={loading} onclick={nextPhase}>
      {phase >= 3 ? '🎯 GD終了 → フィードバックへ' : `次フェーズ →「${nextPhaseName}」`}
    </button>
  </div>
</div>

<!-- FEEDBACK -->
{:else if screen === 'feedback'}
<div class="screen feedback-screen">
  <div class="fb-inner">
    <div class="fb-header">
      <h2 class="fb-title">📊 GDフィードバック</h2>
      <p class="fb-meta">テーマ：{currentTheme?.title}</p>
      <p class="fb-meta">練習時間 {fmtTime(timerVal)} ／ 発言数 {messages.filter(m => m.role === 'user').length}回</p>
    </div>

    {#if feedbackLoading}
      <div class="loading-center">
        <div style="font-size:32px;margin-bottom:12px">⏳</div>
        <p style="color:#8b8fa8;font-size:14px">発言を分析中...</p>
      </div>
    {:else if feedbackData}
      {@const rc = ({ S: '#f7c948', A: '#4f8ef7', B: '#2cb67d', C: '#e8873a' })[feedbackData.rank] ?? '#4f8ef7'}
      {@const sectionColors: Record<string, string> = { '✅': '#2cb67d', '🔧': '#e8873a', '✏️': '#f7a248', '🎯': '#4f8ef7', '📝': '#9b6cf7' }}
      <div class="score-card" style="border-color:{rc};background:{rc}11">
        <div class="score-row">
          <div>
            <div class="score-label">総合スコア</div>
            <div class="score-num" style="color:{rc}">{feedbackData.score}</div>
            <div class="score-max">/ 100点</div>
          </div>
          <div class="divider"></div>
          <div>
            <div class="score-label">ランク</div>
            <div class="rank-num" style="color:{rc}">{feedbackData.rank}</div>
          </div>
        </div>
        <div class="score-bar-wrap">
          <div class="score-bar" style="width:{feedbackData.score}%;background:linear-gradient(90deg,{rc}88,{rc})"></div>
        </div>
        <p style="font-size:13px;color:{rc};margin-top:10px">{feedbackData.rankMsg}</p>
      </div>

      {#each [
        { emoji: '✅', title: '✅ 良かった点', body: feedbackData.good, color: sectionColors['✅'] },
        { emoji: '🔧', title: '🔧 改善点', body: feedbackData.impr, color: sectionColors['🔧'] },
        { emoji: '✏️', title: '✏️ 発言の具体的な言い換え例', body: feedbackData.rewrite, color: sectionColors['✏️'] },
        { emoji: '🎯', title: '🎯 Sansanの評価ポイントとの照らし合わせ', body: feedbackData.sansan, color: sectionColors['🎯'] },
        { emoji: '📝', title: '📝 次回へのアドバイス', body: feedbackData.advice, color: sectionColors['📝'] },
      ] as sec}
        {#if sec.body}
          <div class="fb-section" style="border-left:3px solid {sec.color}">
            <div class="fb-section-title" style="color:{sec.color}">{sec.title}</div>
            <div class="fb-section-body">{@html escHtml(sec.body)}</div>
          </div>
        {/if}
      {/each}
    {/if}

    <!-- Coach Chat -->
    {#if feedbackData && !feedbackLoading}
      <div class="coach-section">
        <div class="coach-title">💬 コーチに質問する</div>
        <p class="coach-sub">フィードバックについて深掘りしたり、改善案を相談できます</p>
        <div class="coach-area" bind:this={coachArea}>
          {#each coachMessages as msg}
            {#if msg.role === 'user'}
              <div class="coach-row user">
                <div class="coach-bubble user">{@html escHtml(msg.content)}</div>
                <div class="coach-avatar">🙋</div>
              </div>
            {:else}
              <div class="coach-row ai">
                <div class="coach-avatar">🎓</div>
                <div class="coach-bubble ai">
                  <div class="ai-label">GDコーチ</div>
                  {@html escHtml(msg.content)}
                </div>
              </div>
            {/if}
          {/each}
          {#if coachLoading}
            <div class="coach-row ai">
              <div class="coach-avatar">🎓</div>
              <div class="thinking blink">考え中...</div>
            </div>
          {/if}
          {#if coachMessages.length === 0}
            <div class="coach-hints">
              {#each ['この改善点をもっと詳しく教えて', 'どう言い換えればよかった？', 'Sansanで評価される発言とは？'] as hint}
                <button class="hint-chip" onclick={() => { coachInput = hint; sendCoach(); }}>{hint}</button>
              {/each}
            </div>
          {/if}
        </div>
        <div class="coach-input-row">
          <input
            class="chat-input"
            bind:value={coachInput}
            placeholder="コーチに質問…"
            disabled={coachLoading}
            onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCoach(); } }}
          />
          <button class="send-btn" disabled={coachLoading} onclick={sendCoach}>送信</button>
        </div>
      </div>
    {/if}

    <div class="btn-row">
      <button class="btn-primary" style="flex:1" onclick={restart}>もう一度練習</button>
      <button class="btn-secondary" onclick={() => screen = 'top'}>トップへ</button>
    </div>
  </div>
</div>
{/if}

<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .modal-overlay {
    position: fixed; inset: 0; background: rgba(0,0,0,0.85);
    display: flex; align-items: center; justify-content: center;
    z-index: 1000; padding: 20px;
  }
  .modal-box {
    background: #111827; border: 1px solid rgba(255,255,255,0.12);
    border-radius: 20px; padding: 28px 24px; max-width: 400px; width: 100%;
    color: #ddd8ce;
  }
  .modal-box h2 { font-size: 18px; margin-bottom: 8px; }
  .modal-box p { font-size: 13px; color: #8b8fa8; line-height: 1.6; margin-bottom: 16px; }
  .modal-box input {
    width: 100%; background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.15); border-radius: 10px;
    padding: 12px 14px; color: #ddd8ce; font-size: 14px; outline: none; margin-bottom: 12px;
  }
  .note { font-size: 11px !important; color: #6b7080 !important; line-height: 1.5 !important; }
  .btn-skip {
    width: 100%; background: none; border: none; color: #8b8fa8; font-size: 13px;
    cursor: pointer; margin-top: 10px; padding: 8px;
  }

  .screen {
    min-height: 100vh;
    font-family: 'Hiragino Kaku Gothic Pro', 'Noto Sans JP', sans-serif;
    background: linear-gradient(160deg, #080c14 0%, #0d1628 60%, #080c14 100%);
    color: #ddd8ce; overflow-x: hidden;
  }

  /* TOP */
  .top-screen { display: flex; align-items: center; justify-content: center; padding: 24px; }
  .top-inner { max-width: 380px; width: 100%; text-align: center; }
  .logo {
    width: 76px; height: 76px; border-radius: 50%;
    background: linear-gradient(135deg,#4f8ef7,#9b6cf7);
    display: flex; align-items: center; justify-content: center;
    font-size: 34px; margin: 0 auto 20px;
    box-shadow: 0 0 48px rgba(79,142,247,0.45);
  }
  .top-title { font-size: 24px; font-weight: bold; margin-bottom: 8px; }
  .top-sub { color: #8b8fa8; font-size: 13px; line-height: 1.7; margin-bottom: 24px; }
  .mode-card {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px; padding: 16px; margin-bottom: 20px; text-align: left;
  }
  .mode-label { font-size: 12px; color: #8b8fa8; margin-bottom: 10px; }
  .mode-btns { display: flex; gap: 8px; }
  .mode-btn {
    flex: 1; padding: 12px 8px; border-radius: 12px; cursor: pointer; text-align: center;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    color: #8b8fa8; transition: all 0.2s;
  }
  .mode-btn.active { background: rgba(79,142,247,0.15); border-color: #4f8ef7; color: #4f8ef7; }
  .mode-btn .icon { font-size: 22px; margin-bottom: 4px; }
  .mode-btn .lbl { font-size: 13px; font-weight: bold; }
  .mode-btn .sub { font-size: 11px; opacity: 0.7; }

  .btn-primary {
    width: 100%; background: linear-gradient(135deg,#4f8ef7,#9b6cf7);
    border: none; border-radius: 12px; padding: 14px; color: #fff;
    font-size: 15px; font-weight: bold; cursor: pointer;
    box-shadow: 0 4px 24px rgba(79,142,247,0.4);
  }

  /* SELECT */
  .select-screen { padding: 24px 20px; }
  .back-btn { background: none; border: none; color: #8b8fa8; cursor: pointer; font-size: 13px; margin-bottom: 20px; padding: 0; }
  .sel-title { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
  .sel-sub { color: #8b8fa8; font-size: 12px; margin-bottom: 16px; }
  .theme-list { display: flex; flex-direction: column; gap: 10px; max-width: 440px; }
  .theme-card {
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px; padding: 16px 18px; text-align: left; cursor: pointer;
    color: #ddd8ce; width: 100%; transition: border-color 0.2s;
  }
  .theme-card:hover { border-color: #4f8ef7; }
  .theme-tags { display: flex; justify-content: space-between; margin-bottom: 8px; }
  .pill { font-size: 11px; padding: 2px 9px; border-radius: 20px; display: inline-block; }
  .theme-text { font-size: 14px; line-height: 1.5; }

  /* PRACTICE */
  .practice-screen { display: flex; flex-direction: column; height: 100vh; min-height: unset; }
  .practice-header { padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }
  .header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 7px; }
  .timer-txt { font-size: 12px; color: #8b8fa8; }
  .phase-pill { font-size: 11px; padding: 3px 10px; border-radius: 20px; }
  .mode-icon { font-size: 11px; color: #8b8fa8; }
  .phase-bar { display: flex; gap: 3px; margin-bottom: 7px; }
  .phase-seg { flex: 1; height: 3px; border-radius: 2px; transition: background 0.3s; }
  .theme-hint { font-size: 11px; color: #8b8fa8; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .api-error-hint { font-size: 11px; color: #f7a248; margin-top: 4px; }

  .chat-area { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .msg-row { display: flex; align-items: flex-end; gap: 8px; }
  .msg-row.user { justify-content: flex-end; }
  .msg-row.ai { justify-content: flex-start; }
  .avatar { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; }
  .bubble { max-width: 78%; padding: 10px 13px; font-size: 14px; line-height: 1.65; }
  .bubble.user { border-radius: 14px 3px 14px 14px; color: #fff; }
  .bubble.ai { border-radius: 3px 14px 14px 14px; background: rgba(255,255,255,0.07); }
  .ai-label { font-size: 10px; color: #8b8fa8; margin-bottom: 3px; }
  .thinking { background: rgba(255,255,255,0.07); border-radius: 3px 14px 14px 14px; padding: 10px 13px; font-size: 13px; color: #8b8fa8; }

  .input-area { padding: 12px 14px; border-top: 1px solid rgba(255,255,255,0.07); flex-shrink: 0; }
  .chat-input-row { display: flex; gap: 8px; margin-bottom: 10px; }
  .chat-input {
    flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px; padding: 10px 13px; color: #ddd8ce; font-size: 14px; outline: none;
  }
  .chat-input:disabled { opacity: 0.5; }
  .send-btn { background: linear-gradient(135deg,#4f8ef7,#9b6cf7); border: none; border-radius: 10px; padding: 10px 18px; color: #fff; font-size: 14px; cursor: pointer; }
  .send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .voice-row { display: flex; align-items: center; gap: 16px; margin-bottom: 10px; }
  .voice-status { flex: 1; text-align: center; font-size: 12px; color: #8b8fa8; }
  .voice-status.recording { color: #e84393; }
  .mic-btn {
    width: 64px; height: 64px; border-radius: 50%; border: none; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; font-size: 26px;
    cursor: pointer; transition: all 0.2s;
    background: linear-gradient(135deg,#4f8ef7,#9b6cf7); box-shadow: 0 4px 20px rgba(79,142,247,0.3);
  }
  .mic-btn.recording { background: linear-gradient(135deg,#e84393,#e8873a); box-shadow: 0 0 24px rgba(232,67,147,0.6); transform: scale(1.08); }
  .mic-btn:disabled { background: rgba(255,255,255,0.08); box-shadow: none; cursor: not-allowed; transform: scale(1); }
  .next-btn {
    width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
    border-radius: 10px; padding: 10px; color: #9b9fa8; font-size: 12px; cursor: pointer;
  }
  .next-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .blink { animation: blink 1.2s infinite; }

  /* FEEDBACK */
  .feedback-screen { padding: 20px 16px 40px; }
  .fb-inner { max-width: 440px; margin: 0 auto; }
  .fb-header { text-align: center; margin-bottom: 20px; }
  .fb-title { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
  .fb-meta { color: #8b8fa8; font-size: 12px; margin-bottom: 2px; }
  .score-card { background: rgba(255,255,255,0.04); border: 1px solid; border-radius: 16px; padding: 20px; margin-bottom: 12px; text-align: center; }
  .score-row { display: flex; justify-content: center; align-items: center; gap: 20px; }
  .score-label { font-size: 11px; color: #8b8fa8; margin-bottom: 4px; }
  .score-num { font-size: 42px; font-weight: bold; line-height: 1; }
  .score-max { font-size: 11px; color: #8b8fa8; }
  .divider { width: 1px; height: 60px; background: rgba(255,255,255,0.1); }
  .rank-num { font-size: 52px; font-weight: bold; line-height: 1; }
  .score-bar-wrap { margin-top: 16px; background: rgba(255,255,255,0.08); border-radius: 4px; height: 6px; overflow: hidden; }
  .score-bar { height: 100%; border-radius: 4px; }
  .fb-section { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 14px 16px; margin-bottom: 10px; }
  .fb-section-title { font-size: 13px; font-weight: bold; margin-bottom: 8px; }
  .fb-section-body { font-size: 13px; line-height: 1.8; color: #c8c4bc; white-space: pre-wrap; }
  .btn-row { display: flex; gap: 10px; margin-top: 16px; }
  .btn-secondary { flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 14px; color: #8b8fa8; font-size: 14px; cursor: pointer; }
  .loading-center { text-align: center; padding: 32px; background: rgba(255,255,255,0.04); border-radius: 16px; margin-bottom: 16px; }

  /* COACH CHAT */
  .coach-section { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 16px; margin-bottom: 12px; }
  .coach-title { font-size: 15px; font-weight: bold; margin-bottom: 4px; }
  .coach-sub { font-size: 12px; color: #8b8fa8; margin-bottom: 12px; }
  .coach-area { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; max-height: 300px; overflow-y: auto; }
  .coach-row { display: flex; align-items: flex-end; gap: 8px; }
  .coach-row.user { justify-content: flex-end; }
  .coach-row.ai { justify-content: flex-start; }
  .coach-avatar { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
  .coach-bubble { max-width: 85%; padding: 10px 13px; font-size: 14px; line-height: 1.65; }
  .coach-bubble.user { border-radius: 14px 3px 14px 14px; background: linear-gradient(135deg,#4f8ef7,#9b6cf7); color: #fff; }
  .coach-bubble.ai { border-radius: 3px 14px 14px 14px; background: rgba(255,255,255,0.07); }
  .coach-hints { display: flex; flex-direction: column; gap: 6px; }
  .hint-chip { background: rgba(79,142,247,0.1); border: 1px solid rgba(79,142,247,0.3); border-radius: 20px; padding: 8px 14px; color: #4f8ef7; font-size: 12px; cursor: pointer; text-align: left; }
  .hint-chip:hover { background: rgba(79,142,247,0.2); }
  .coach-input-row { display: flex; gap: 8px; }
</style>
