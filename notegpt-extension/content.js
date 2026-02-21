(() => {
  const ROOT_ID = 'notegpt-root';
  const conversationKey = `notegpt:${location.pathname}`;

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'NOTEGPT_CAPTURE_AND_OPEN') {
      const msgs = captureConversation();
      mountWorkspace(msgs);
    }
    if (message.type === 'NOTEGPT_EXPORT_PDF') {
      exportPdf();
    }
  });

  function captureConversation() {
    const candidates = Array.from(document.querySelectorAll('[data-message-author-role], article'));
    const messages = candidates
      .map((el, index) => {
        const roleAttr = el.getAttribute('data-message-author-role') || '';
        const role = roleAttr || (el.textContent?.includes('You said:') ? 'user' : 'assistant');
        const textEl = el.querySelector('.markdown, .prose, [data-message-content]') || el;
        const text = (textEl.innerText || '').trim();
        if (!text) return null;
        return {
          id: `${Date.now()}-${index}`,
          role: role.includes('user') ? 'user' : 'assistant',
          text,
          comment: ''
        };
      })
      .filter(Boolean);

    if (!messages.length) {
      alert('NoteGPT 未找到可捕捉的聊天内容，请先打开一个对话。');
      return [];
    }

    chrome.storage.local.set({ [conversationKey]: messages });
    return messages;
  }

  function mountWorkspace(messages) {
    let data = messages;
    if (!data?.length) {
      chrome.storage.local.get([conversationKey], (res) => {
        const cached = res[conversationKey] || [];
        if (!cached.length) {
          alert('NoteGPT 暂无捕捉数据，请先点击“捕捉并打开笔记区”。');
          return;
        }
        mountWorkspace(cached);
      });
      return;
    }

    const existing = document.getElementById(ROOT_ID);
    if (existing) existing.remove();

    const root = document.createElement('aside');
    root.id = ROOT_ID;
    root.innerHTML = `
      <div id="notegpt-header">
        <span id="notegpt-title">📝 NoteGPT</span>
        <div>
          <button class="notegpt-btn secondary" id="notegpt-save">保存</button>
          <button class="notegpt-btn warn" id="notegpt-close">关闭</button>
        </div>
      </div>
      <div id="notegpt-body"></div>
    `;

    const body = root.querySelector('#notegpt-body');
    data.forEach((msg, idx) => body.appendChild(createCard(msg, idx)));

    root.querySelector('#notegpt-close').addEventListener('click', () => root.remove());
    root.querySelector('#notegpt-save').addEventListener('click', () => saveWorkspace(root));

    document.body.appendChild(root);
  }

  function createCard(msg, idx) {
    const card = document.createElement('section');
    card.className = 'notegpt-card';
    card.dataset.index = String(idx);

    card.innerHTML = `
      <span class="notegpt-role ${msg.role}">${msg.role === 'user' ? '用户' : 'ChatGPT'}</span>
      <div class="notegpt-content" contenteditable="true"></div>
      <div class="notegpt-toolbar">
        <button class="notegpt-btn" data-color="yellow">黄色高亮</button>
        <button class="notegpt-btn" data-color="green">绿色高亮</button>
        <button class="notegpt-btn" data-color="pink">粉色高亮</button>
      </div>
      <textarea class="notegpt-comment" placeholder="为这条消息添加批注..."></textarea>
    `;

    const content = card.querySelector('.notegpt-content');
    const comment = card.querySelector('.notegpt-comment');
    content.textContent = msg.text;
    comment.value = msg.comment || '';

    card.querySelectorAll('[data-color]').forEach((btn) => {
      btn.addEventListener('click', () => applyHighlight(content, btn.dataset.color));
    });

    return card;
  }

  function applyHighlight(container, color) {
    container.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      alert('请先在笔记内容中选中文本后再高亮。');
      return;
    }

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      alert('请在当前消息内容范围内选中文字。');
      return;
    }

    const span = document.createElement('span');
    span.className = `notegpt-highlight-${color}`;
    range.surroundContents(span);
    selection.removeAllRanges();
  }

  function saveWorkspace(root) {
    const cards = Array.from(root.querySelectorAll('.notegpt-card'));
    const payload = cards.map((card) => {
      const role = card.querySelector('.notegpt-role').textContent === '用户' ? 'user' : 'assistant';
      return {
        id: `${Date.now()}-${card.dataset.index}`,
        role,
        html: card.querySelector('.notegpt-content').innerHTML,
        comment: card.querySelector('.notegpt-comment').value
      };
    });

    chrome.storage.local.set({ [conversationKey]: payload }, () => {
      alert('NoteGPT 已保存当前笔记。');
    });
  }

  function exportPdf() {
    const root = document.getElementById(ROOT_ID);
    if (!root) {
      chrome.storage.local.get([conversationKey], (res) => {
        const data = res[conversationKey] || [];
        if (!data.length) {
          alert('请先捕捉聊天内容。');
          return;
        }
        exportFromData(data);
      });
      return;
    }

    saveWorkspace(root);
    const cards = Array.from(root.querySelectorAll('.notegpt-card')).map((card) => ({
      role: card.querySelector('.notegpt-role').textContent,
      html: card.querySelector('.notegpt-content').innerHTML,
      comment: card.querySelector('.notegpt-comment').value
    }));
    exportFromData(cards);
  }

  function exportFromData(cards) {
    const html = cards
      .map(
        (c) => `
          <article style="border:1px solid #ddd;border-radius:8px;padding:10px;margin-bottom:12px;">
            <div style="font-size:12px;color:#666;margin-bottom:6px;">${c.role}</div>
            <div style="line-height:1.7;">${c.html || escapeHtml(c.text || '')}</div>
            ${c.comment ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #ccc;"><b>批注：</b>${escapeHtml(c.comment)}</div>` : ''}
          </article>
        `
      )
      .join('');

    const popup = window.open('', '_blank');
    if (!popup) {
      alert('浏览器阻止了弹窗，请允许弹窗后重试导出。');
      return;
    }

    popup.document.write(`
      <!doctype html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <title>NoteGPT 导出</title>
        <style>
          body{font-family:Arial,sans-serif;padding:24px;max-width:900px;margin:auto;}
          h1{font-size:22px;} 
          .notegpt-highlight-yellow{background:#fef08a;}
          .notegpt-highlight-green{background:#bbf7d0;}
          .notegpt-highlight-pink{background:#fbcfe8;}
        </style>
      </head>
      <body>
        <h1>NoteGPT 聊天笔记导出</h1>
        <p>页面加载后会自动唤起打印，打印目标选择“另存为 PDF”。</p>
        ${html}
        <script>window.onload = () => window.print();</script>
      </body>
      </html>
    `);
    popup.document.close();
  }

  function escapeHtml(str) {
    return str
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
})();
