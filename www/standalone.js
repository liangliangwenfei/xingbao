// ============================================
// 星宝训练营 - 独立运行模块
// 替换所有Flask API调用，支持离线运行
// ============================================

// ===== 对话状态管理 =====
let _conv = null; // 当前对话状态

function _newConv(modId, itemId) {
    const mod = MODULES_DATA[modId];
    const item = mod.items.find(i => i.id === itemId);
    return {
        module_id: modId, item_id: itemId, module_type: mod.type,
        messages: [], message_count: 0, score: 0, evaluations: [],
        hints_used: 0, started_at: new Date().toISOString(),
        aba_trials: [], aba_correct: 0, aba_total: 0,
        aba_streak: 0, aba_independent_count: 0
    };
}

// ===== 演示模式AI回复 =====
const _DEMO = {
    social: ['听起来真有意思！我自己也有类似的经历呢。你还有其他的兴趣吗？','嗯嗯，我理解你说的～那是什么让你对这个感兴趣的呀？','哈哈确实！跟你聊天很开心，你还有什么想分享的吗？','哇！这个角度我还没想过诶～能再多说一点吗？'],
    daily_life: ['好的，没问题！请问还有什么需要帮您的吗？','明白了，您稍等一下。这样就可以了，还需要什么吗？','好的，已经帮您处理好了。祝您愉快！','没问题！还有其他需要吗？'],
    expression: ['你说得很好！继续发挥你的观察力～','不错！你的表达能力在进步呢。再来试试？','很棒！你说得越来越清楚了。','真厉害！你的进步我都看在眼里～'],
    emotion: ['谢谢你愿意和我分享这些...我听到了，你说的这些感受都很真实。','我理解那种感觉...你已经做得很好了——注意到了自己的感受，这就是很重要的一步。','没关系，慢慢来。每一种情绪都是可以被接纳的。','你的觉察力在成长呢...我们花一点时间，一起呼吸几次好吗？'],
    sleep: ['嗯...让自己再沉下去一点点...每一次呼吸，都带走一些白天的重量...','做得很好...就这样...不用急着去任何地方，此刻，你只需要安静地呼吸...','夜色很温柔...你值得这样的休息...','每呼出一口气，身体就更放松一点点...很自然...']
};
function _demoReply(modId) {
    const replies = _DEMO[modId] || _DEMO.social;
    return replies[Math.floor(Math.random() * replies.length)];
}
function _demoEval() {
    return {
        score: Math.floor(Math.random() * 4) + 6,
        feedback: ['很好的回应！','做得不错！','表达得很清楚！','继续保持！','越来越棒了！'][Math.floor(Math.random()*5)],
        tip: ['可以多分享自己的想法','下次问问对方的看法','试着展开多说一点','注意回应对方哦'][Math.floor(Math.random()*4)]
    };
}

// ===== ABA评估 =====
function _evalAba(program, userMsg) {
    const msg = userMsg.trim();
    const examples = program.examples || [];
    let correct = 'partial', score = 10;
    // 简单匹配
    for (const ex of examples) {
        if (msg.includes(ex.replace(/[！!，,。.]/g, '').substring(0, 3))) {
            correct = 'yes'; score = 20; break;
        }
    }
    if (msg.length < 2) { correct = 'no'; score = 5; }
    return {
        correct, prompt_level: correct === 'yes' ? 0 : 1,
        feedback: correct === 'yes' ? '太棒了！你说得完全正确！' : correct === 'partial' ? '接近了！再试试看？' : '没关系，跟我一起说一遍吧～',
        aba_stats: null // filled in sendMessage
    };
}

// ===== 徽章检查 =====
function _checkBadges(conv) {
    const earned = [];
    const completed = JSON.parse(localStorage.getItem('sa_completed') || '[]');
    const allB = JSON.parse(localStorage.getItem('sa_badges') || '[]');

    const addB = (id) => { if (!allB.includes(id)) { allB.push(id); earned.push(id); } };

    if (conv.message_count >= 1) addB('first_chat');
    if (conv.hints_used > 0) addB('use_hint');
    if (conv.message_count >= 10) addB('ten_messages');
    if (conv.score >= 80) addB('high_score');
    if (conv.aba_streak >= 5) addB('aba_perfect');
    if (conv.aba_independent_count >= 10) addB('aba_independent');

    const key = conv.module_id + ':' + conv.item_id;
    if (!completed.includes(key)) completed.push(key);
    localStorage.setItem('sa_completed', JSON.stringify(completed));

    const cnt = (prefix) => completed.filter(c => c.startsWith(prefix + ':')).length;
    if (cnt('social') >= 6) addB('all_social');
    if (cnt('daily_life') >= 6) addB('all_daily');
    if (cnt('expression') >= 4) addB('all_expression');
    if (cnt('aba') >= 6) addB('all_aba');
    if (cnt('emotion') >= 6) addB('all_emotion');
    if (cnt('sleep') >= 6) addB('all_sleep');
    if (cnt('social')>0 && cnt('daily_life')>0 && cnt('expression')>0 && cnt('aba')>0 && cnt('emotion')>0 && cnt('sleep')>0) addB('cross_module');
    if (completed.length >= 3) addB('three_topics');

    const sessions = parseInt(localStorage.getItem('sa_sessions') || '0');
    if (sessions >= 5) addB('five_sessions');

    localStorage.setItem('sa_badges', JSON.stringify(allB));
    return earned;
}

// BADGES数据
const BADGES_DATA = {
    first_chat:{name:'初次对话',icon:'🗣️',desc:'完成第一次训练'},
    three_topics:{name:'话题达人',icon:'🎯',desc:'完成3个不同项目的训练'},
    ten_messages:{name:'积极沟通',icon:'💬',desc:'在一次训练中发送10条以上消息'},
    high_score:{name:'社交新星',icon:'🌟',desc:'单次训练获得80分以上'},
    all_social:{name:'社交达人',icon:'🤝',desc:'完成社交对话全部6个话题'},
    all_daily:{name:'生活能手',icon:'🏠',desc:'完成日常生活全部6个场景'},
    all_expression:{name:'表达之星',icon:'🗣️',desc:'完成口语表达全部4项练习'},
    all_aba:{name:'ABA小达人',icon:'📋',desc:'完成ABA全部6个训练项目'},
    all_emotion:{name:'情绪主人',icon:'💙',desc:'完成安抚情绪全部6项练习'},
    all_sleep:{name:'好梦成真',icon:'🌙',desc:'完成睡眠提升全部6项练习'},
    use_hint:{name:'善于求助',icon:'💡',desc:'使用提示功能'},
    five_sessions:{name:'坚持不懈',icon:'🔥',desc:'完成5次训练'},
    aba_perfect:{name:'百分百正确',icon:'💯',desc:'ABA训练中连续5次独立正确'},
    aba_independent:{name:'独立完成',icon:'💪',desc:'ABA训练中累计10次独立正确反应'},
    cross_module:{name:'全面开花',icon:'🌈',desc:'六个训练模块都至少完成过一次'}
};

// ===== 提示数据 =====
const HINTS_DATA = {
    social:{
        travel:['💡 问问对方去过最远的地方','💡 分享你自己的出行经历','💡 聊聊最想去的地方'],
        books:['💡 说说最近看的书','💡 问问喜欢什么类型','💡 聊聊小时候喜欢的书'],
        sports:['💡 说说喜欢的运动','💡 问问运动心得','💡 聊聊看过的比赛'],
        music:['💡 说说循环播放的歌','💡 聊聊去过的音乐现场','💡 问问用什么听歌软件'],
        movies:['💡 说说最近的电影','💡 问问喜欢的导演','💡 聊聊感动的片段'],
        games:['💡 说说最近玩的游戏','💡 问问喜欢什么类型','💡 聊聊通关经历']
    },
    daily_life:{
        ordering:['💡 看看菜单选一道菜','💡 问问有什么特色推荐','💡 告诉服务员你的预算'],
        shopping:['💡 说出你要找的东西','💡 问问这个东西在哪里','💡 比较一下不同品牌'],
        directions:['💡 说出你要去的地方','💡 问问附近有什么标志','💡 确认一下步行要多久'],
        doctor:['💡 说出哪里不舒服','💡 描述什么时候开始的','💡 问问需要注意什么'],
        phone_call:['💡 先问好再回应','💡 确认时间和地点','💡 如果不去要礼貌说明'],
        appointment:['💡 说出想预约什么','💡 确认可用的时间段','💡 留下联系方式']
    },
    expression:{
        describe:['💡 从颜色开始描述','💡 说说形状和大小','💡 描述一下给你的感觉'],
        storytelling:['💡 先想一个开头','💡 加入有趣的角色','💡 给故事一个温暖的结尾'],
        feelings:['💡 用"我感到..."开头','💡 说说身体有什么反应','💡 想想是什么引起的'],
        retell:['💡 先回忆主要人物','💡 想想发生了什么','💡 用自己的话说出结果']
    },
    aba:{
        greeting:['💡 想想见到认识的人说什么','💡 可以说"XX好"','💡 加上对方的称呼'],
        thanking:['💡 说"谢谢"是最基本的','💡 可以说"谢谢你帮我"','💡 加上微笑的表情更好'],
        asking_help:['💡 先说称呼，再说需要什么','💡 用"请问"开头','💡 说清楚具体需要什么帮助'],
        waiting:['💡 用语言表达愿意等待','💡 可以说"你先，我等"','💡 聊聊轮流玩的规则'],
        identify_feeling:['💡 收到礼物是什么心情？','💡 用"开心"类似的词','💡 想想会有什么表情'],
        saying_no:['💡 先说"对不起"','💡 说明不能去的原因','💡 提议另一个时间']
    },
    emotion:{
        identify_emotion:['💡 用"我感到..."开头','💡 情绪没有对错','💡 留意身体的感觉'],
        deep_breathing:['💡 注意力放在呼吸上','💡 感受腹部鼓起','💡 想象紧张感流走了'],
        grounding:['💡 看看周围有什么','💡 摸摸手边的东西','💡 听听有什么声音'],
        positive_self_talk:['💡 "我已经做得很好了"','💡 "慢慢来，没关系的"','💡 像安慰好朋友那样'],
        safe_place:['💡 想想那里的颜色','💡 那里有什么声音？','💡 在那里身体感觉怎样？'],
        progressive_relax:['💡 找到身体紧张的地方','💡 用力绷紧再放松','💡 对比紧张和放松的感觉']
    },
    sleep:{
        bedtime_routine:['💡 睡前1小时放下手机','💡 泡一杯温热的牛奶','💡 听轻柔的音乐'],
        breath_sleep:['💡 吸气4秒屏7秒呼8秒','💡 注意力放在呼气上','💡 每次呼气身体更沉'],
        body_scan:['💡 从脚趾开始往上','💡 注意哪里还紧绷','💡 想象温暖的光在流动'],
        sleep_visualization:['💡 想象躺在柔软的云上','💡 星光很温柔','💡 让念头随风而去'],
        sleep_hygiene:['💡 卧室18-22度最合适','💡 每天差不多时间睡','💡 睡前别喝咖啡浓茶'],
        calming_story:['💡 沉浸到故事里','💡 想象每一步更放松','💡 月光照在你身上']
    }
};

// ============ 覆盖训练函数（独立运行版） ============

// 重写 startTraining
const _origStartTraining = startTraining;
startTraining = async function() {
    if (!curModule || !curItem) return;
    try {
        const mod = MODULES_DATA[curModule];
        const item = mod.items.find(i => i.id === curItem);
        if (!item) { alert('项目未找到'); return; }

        _conv = _newConv(curModule, curItem);
        const opening = item.opening || item.instruction || item.sd || '准备好了吗？开始吧！';
        const character = item.character || '训练助手';

        document.getElementById('trainSelectView').style.display = 'none';
        document.getElementById('trainActiveView').style.display = 'block';
        const color = mod.color || '#4A9C5C';
        document.getElementById('trainAvatar').style.background = color;
        document.getElementById('trainAvatar').textContent = mod.icon;
        document.getElementById('trainTitle').textContent = item.name + ' · ' + character;
        document.getElementById('trainSubtitle').textContent = mod.name;
        document.getElementById('trainScore').textContent = '0';
        document.getElementById('abaBar').style.display = mod.type === 'aba' ? 'flex' : 'none';
        document.getElementById('chatArea').innerHTML = '';
        addMsg('ai', opening, mod.icon, color);

        let sessions = parseInt(localStorage.getItem('sa_sessions') || '0');
        localStorage.setItem('sa_sessions', String(sessions + 1));

        trainingActive = true;
        document.getElementById('msgInput').focus();
    } catch(e) { alert('开始失败: ' + e.message); }
};

// 重写 sendMessage
const _origSendMessage = sendMessage;
sendMessage = async function() {
    if (!trainingActive || isSending || !_conv) return;
    const input = document.getElementById('msgInput');
    const msg = input.value.trim();
    if (!msg) return;

    isSending = true;
    document.getElementById('btnSend').disabled = true;
    input.value = '';
    addMsg('user', msg);
    const loadEl = addLoading();
    stopListening();

    try {
        const mod = MODULES_DATA[_conv.module_id];
        const item = mod.items.find(i => i.id === _conv.item_id);
        _conv.message_count++;
        _conv.messages.push({ role: 'user', content: msg });

        let aiResponse, evaluation;
        const apiKey = getApiKey();

        if (apiKey) {
            // TODO: 真实DeepSeek API调用
            // 目前先用演示模式
            aiResponse = _demoReply(_conv.module_id);
            evaluation = _demoEval();
        } else {
            aiResponse = _demoReply(_conv.module_id);
            evaluation = _demoEval();
        }

        // ABA特殊处理
        if (mod.type === 'aba') {
            const abaEval = _evalAba(item, msg);
            _conv.aba_total++;
            if (abaEval.correct === 'yes') { _conv.aba_correct++; _conv.aba_streak++; _conv.aba_independent_count++; }
            else if (abaEval.correct === 'partial') { _conv.aba_correct += 0.5; _conv.aba_streak = 0; }
            else { _conv.aba_streak = 0; }
            _conv.score += abaEval.correct === 'yes' ? 20 : abaEval.correct === 'partial' ? 10 : 5;
            _conv.aba_trials.push({ response: msg, correct: abaEval.correct });
            aiResponse = abaEval.feedback + '\n\n' + (item.sd || '');
            evaluation = { score: abaEval.correct === 'yes' ? 10 : 5, feedback: abaEval.feedback, tip: '',
                aba_stats: { correct_count: Math.floor(_conv.aba_correct), total_trials: _conv.aba_total,
                    rate: Math.round(_conv.aba_correct / _conv.aba_total * 100),
                    streak: _conv.aba_streak, independent: _conv.aba_independent_count } };
        } else {
            _conv.score += evaluation.score * 2;
            _conv.evaluations.push(evaluation);
        }

        _conv.messages.push({ role: 'ai', content: aiResponse });
        loadEl.remove();

        if (evaluation && mod.type !== 'aba') {
            addEval(evaluation.feedback + (evaluation.tip ? ' — ' + evaluation.tip : ''));
        }
        addMsg('ai', aiResponse);
        document.getElementById('trainScore').textContent = _conv.score;

        if (mod.type === 'aba' && evaluation && evaluation.aba_stats) {
            updateAba(evaluation.aba_stats);
        }

        const newBadges = _checkBadges(_conv);
        if (newBadges.length > 0) {
            newBadges.forEach(b => addBadge(BADGES_DATA[b] || { name: b, icon: '🏆', desc: '' }));
            refreshAll();
        }

        if (speakerOn) speakText(aiResponse);
        scrollDown();
    } catch(e) {
        loadEl.remove();
        addMsg('ai', '发送失败: ' + e.message);
    } finally {
        isSending = false;
        document.getElementById('btnSend').disabled = false;
    }
};

// 重写 getHint
const _origGetHint = getHint;
getHint = async function() {
    if (!trainingActive || isSending || !_conv) return;
    _conv.hints_used++;
    const hints = (HINTS_DATA[_conv.module_id] || {})[_conv.item_id] || ['💡 慢慢来，想说什么就说什么'];
    const hint = hints[Math.floor(Math.random() * hints.length)];
    addMsg('ai', hint, '💡', '#E8833A');
    const newBadges = _checkBadges(_conv);
    if (newBadges.length > 0) { newBadges.forEach(b => addBadge(BADGES_DATA[b] || { name: b, icon: '🏆', desc: '' })); refreshAll(); }
    scrollDown();
};

// 重写 endTraining
const _origEndTraining = endTraining;
endTraining = async function() {
    if (!trainingActive || !_conv) return;
    trainingActive = false;
    stopListening();

    const mod = MODULES_DATA[_conv.module_id];
    const item = mod.items.find(i => i.id === _conv.item_id);
    const newBadges = _checkBadges(_conv);

    let avgScore = 0;
    if (_conv.evaluations.length > 0) {
        avgScore = _conv.evaluations.reduce((s, e) => s + (e.score || 5), 0) / _conv.evaluations.length;
    }

    const coinsEarned = Math.max(1, Math.floor(_conv.score / 10));
    const badgeBonus = newBadges.length * 5;
    const totalCoins = coinsEarned + badgeBonus;
    addCoins(totalCoins);

    const allB = JSON.parse(localStorage.getItem('sa_badges') || '[]');
    const newNames = newBadges.map(id => (BADGES_DATA[id] || {}).name || id);
    let abaHTML = '';
    if (mod.type === 'aba' && _conv.aba_total > 0) {
        abaHTML = `<div style="font-size:12px;font-weight:600;margin:8px 0;">📋 ABA数据：正确${Math.floor(_conv.aba_correct)}/${_conv.aba_total}（${Math.round(_conv.aba_correct/_conv.aba_total*100)}%）独立${_conv.aba_independent_count}次</div>`;
    }
    let badgeHTML = '';
    if (allB.length > 0) {
        badgeHTML = `<div class="badges-row">${allB.map(id => {
            const b = BADGES_DATA[id] || { name: id, icon: '🏆' };
            return `<span class="badge-tag ${newBadges.includes(id)?'new-badge':''}">${b.icon}${b.name}${newBadges.includes(id)?'🆕':''}</span>`;
        }).join('')}</div>`;
    }

    let msg = '🌱 每一次尝试都是进步的开始，继续加油！';
    if (avgScore >= 8) msg = '🌟 太棒了！你表现得非常出色！';
    else if (avgScore >= 6) msg = '👍 做得很好！每次练习都在进步。';
    else if (avgScore >= 4) msg = '💪 不错哦！坚持下去会越来越好。';

    document.getElementById('summaryContent').innerHTML = `
        <div class="sum-icon">${mod.icon}</div>
        <h2>${item.name} · 训练完成</h2>
        <p style="color:var(--muted);font-size:13px;margin:6px 0;">${msg}</p>
        <div class="stats-row">
            <div class="stat-item"><div class="val">${_conv.score}</div><div class="lbl">积分</div></div>
            <div class="stat-item"><div class="val">${_conv.message_count}</div><div class="lbl">轮次</div></div>
            <div class="stat-item"><div class="val">${avgScore.toFixed(1)}</div><div class="lbl">评分</div></div>
        </div>
        ${abaHTML}
        <div style="background:var(--gold-light);border-radius:14px;padding:10px;margin:10px 0;text-align:center;">
            <span style="font-size:24px;">🪙</span>
            <div style="font-weight:700;color:#8B6914;">获得 <b style="font-size:20px;">${totalCoins}</b> 金币！</div>
            <div style="font-size:10px;color:#8B6914;">训练得分 ${coinsEarned} + 徽章奖励 ${badgeBonus}</div>
        </div>
        ${badgeHTML}
        <button class="btn-restart" onclick="closeSummary()">🔄 继续训练</button>
    `;
    document.getElementById('summaryModal').classList.add('open');

    _conv = null;
    refreshAll();
};

// 重写 loadStats
loadStats = function() {
    const sessions = parseInt(localStorage.getItem('sa_sessions') || '0');
    const badges = JSON.parse(localStorage.getItem('sa_badges') || '[]');
    document.getElementById('topSessions').textContent = sessions;
    document.getElementById('topBadges').textContent = badges.length;
};

// PWA install banner 在独立版中需要手动触发
window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    window._deferredPrompt = e;
    if (!localStorage.getItem('sa_install_dismissed')) {
        const banner = document.getElementById('installBanner');
        if (banner) banner.classList.add('show');
    }
});

console.log('🦏 星宝训练营 - 独立运行版已就绪');
console.log('   演示模式：✅（离线可用）');
console.log('   AI模式：配置API Key后启用');
