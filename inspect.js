/* globals chrome */
var xPathFinder = xPathFinder || (() => {
  class Inspector {
    constructor() {
      this.win = window;
      this.doc = window.document;

      this.draw = this.draw.bind(this);
      this.getData = this.getData.bind(this);
      this.setOptions = this.setOptions.bind(this);

      this.cssNode = 'xpath-css';
      this.contentNode = 'xpath-content';
      this.overlayElement = 'xpath-overlay';
    }

    getData(e, iframe) {
      e.stopImmediatePropagation();
      e.preventDefault && e.preventDefault();
      e.stopPropagation && e.stopPropagation();

      if (e.target.id !== this.contentNode) {
        this.XPath = this.getXPath(e.target);
        const contentNode   = document.getElementById(this.contentNode);
        const iframeNode    = window.frameElement || iframe;
        const contentString = iframeNode ? `Iframe: ${this.getXPath(iframeNode)}<br/>XPath: ${this.XPath}` : this.XPath;

        if (contentNode) {
          contentNode.innerHTML = contentString;
        } else {
          const contentHtml = document.createElement('div');
          contentHtml.innerHTML = contentString;
          contentHtml.id = this.contentNode;
          document.body.appendChild(contentHtml);
        }
        this.options.clipboard && ( this.copyText(this.XPath) );
        this.options.robotcmds && this.forecastRobotCommands(e.target, this.XPath);
      }
    }

    getOptions() {
      const storage = chrome.storage && (chrome.storage.local);
      const promise = storage.get({
        inspector: true,
        clipboard: true,
        shortid: true,
        robotcmds: true,
        position: 'bl'
      }, this.setOptions);
      (promise && promise.then) && (promise.then(this.setOptions()));
    }

    setOptions(options) {
      this.options = options;
      let position = 'bottom:0;left:0';
      switch (options.position) {
        case 'tl': position = 'top:0;left:0'; break;
        case 'tr': position = 'top:0;right:0'; break;
        case 'br': position = 'bottom:0;right:0'; break;
        default: break;
      }
      this.styles = `body *{cursor:crosshair!important;}#xpath-content{${position};cursor:initial!important;padding:10px;background:gray;color:white;position:fixed;font-size:14px;z-index:10000001;}`;
      this.activate();
    }

    createOverlayElements() {
      const overlayStyles = {
        background: 'rgba(120, 170, 210, 0.7)',
        padding: 'rgba(77, 200, 0, 0.3)',
        margin: 'rgba(255, 155, 0, 0.3)',
        border: 'rgba(255, 200, 50, 0.3)'
      };

      this.container = this.doc.createElement('div');
      this.node = this.doc.createElement('div');
      this.border = this.doc.createElement('div');
      this.padding = this.doc.createElement('div');
      this.content = this.doc.createElement('div');

      this.border.style.borderColor = overlayStyles.border;
      this.padding.style.borderColor = overlayStyles.padding;
      this.content.style.backgroundColor = overlayStyles.background;

      Object.assign(this.node.style, {
        borderColor: overlayStyles.margin,
        pointerEvents: 'none',
        position: 'fixed'
      });

      this.container.id = this.overlayElement;
      this.container.style.zIndex = 10000000;
      this.node.style.zIndex = 10000000;

      this.container.appendChild(this.node);
      this.node.appendChild(this.border);
      this.border.appendChild(this.padding);
      this.padding.appendChild(this.content);
    }

    removeOverlay() {
      const overlayHtml = document.getElementById(this.overlayElement);
      overlayHtml && overlayHtml.remove();
    }

    copyText(XPath) {
      const hdInp = document.createElement('textarea');
      hdInp.textContent = XPath;
      document.body.appendChild(hdInp);
      hdInp.select();
      document.execCommand('copy');
      hdInp.remove();
    }

    draw(e) {
      const node = e.target;
      if (node.id !== this.contentNode) {
        this.removeOverlay();

        const box = this.getNestedBoundingClientRect(node, this.win);
        const dimensions = this.getElementDimensions(node);

        this.boxWrap(dimensions, 'margin', this.node);
        this.boxWrap(dimensions, 'border', this.border);
        this.boxWrap(dimensions, 'padding', this.padding);

        Object.assign(this.content.style, {
          height: box.height - dimensions.borderTop - dimensions.borderBottom - dimensions.paddingTop - dimensions.paddingBottom + 'px',
          width: box.width - dimensions.borderLeft - dimensions.borderRight - dimensions.paddingLeft - dimensions.paddingRight + 'px',
        });

        Object.assign(this.node.style, {
          top: box.top - dimensions.marginTop + 'px',
          left: box.left - dimensions.marginLeft + 'px',
        });

        this.doc.body.appendChild(this.container);
      }
    }

    activate() {
      this.createOverlayElements();
      // add styles
      if (!document.getElementById(this.cssNode)) {
        const styles = document.createElement('style');
        styles.innerText = this.styles;
        styles.id = this.cssNode;
        document.getElementsByTagName('head')[0].appendChild(styles);
      }
      // add listeners for all frames and root
      document.addEventListener('click', this.getData, true);
      this.options.inspector && ( document.addEventListener('mouseover', this.draw) );
      try {
        const frameLength = window.parent.frames.length
        for (let i = 0 ; i < frameLength; i++) {
          let frame = window.parent.frames[i];
          frame.document.addEventListener('click', e => this.getData(e, frame.frameElement), true);
          this.options.inspector && (frame.document.addEventListener('mouseover', this.draw) );
        }
      } catch (e) {
        this.warn(e.message);
      }
    }

    deactivate() {
      // remove styles
      const cssNode = document.getElementById(this.cssNode);
      cssNode && cssNode.remove();
      // remove overlay
      this.removeOverlay();
      // remove xpath html
      const contentNode = document.getElementById(this.contentNode);
      contentNode && contentNode.remove();
      // remove listeners for all frames and root
      document.removeEventListener('click', this.getData, true);
      this.options && this.options.inspector && ( document.removeEventListener('mouseover', this.draw) );
      try {
        const frameLength = window.parent.frames.length
        for (let i = 0 ; i < frameLength; i++) {
          let frameDocument = window.parent.frames[i].document
          frameDocument.removeEventListener('click', this.getData, true);
          this.options && this.options.inspector && ( frameDocument.removeEventListener('mouseover', this.draw) );
        }
      } catch (e) {
        this.warn(e.message);
      }
    }

    getXPath(el) {
      let nodeElem = el;
      let uniqPath = null;

      // Check unique path of current node
      if (this.options.shortid) {
        uniqPath = this.findUniqPath(nodeElem, true);
        if (uniqPath) {
          return `//${uniqPath}`;
        }
      }

      const parts = [];
      while (nodeElem && nodeElem.nodeType === Node.ELEMENT_NODE) {
        let nbOfPreviousSiblings = 0;
        let hasNextSiblings = false;
        let sibling = nodeElem.previousSibling;
        while (sibling) {
          if (sibling.nodeType !== Node.DOCUMENT_TYPE_NODE && sibling.nodeName === nodeElem.nodeName) {
            nbOfPreviousSiblings++;
          }
          sibling = sibling.previousSibling;
        }
        sibling = nodeElem.nextSibling;
        while (sibling) {
          if (sibling.nodeName === nodeElem.nodeName) {
            hasNextSiblings = true;
            break;
          }
          sibling = sibling.nextSibling;
        }
        const prefix = nodeElem.prefix ? nodeElem.prefix + ':' : '';
        const nth = nbOfPreviousSiblings || hasNextSiblings ? `[${nbOfPreviousSiblings + 1}]` : '';
        parts.push(prefix + nodeElem.localName + nth);
        nodeElem = nodeElem.parentNode;

        // Check unique path of the parent node
        if (this.options.shortid && nodeElem) {
          uniqPath = this.findUniqPath(nodeElem, false);
          if (uniqPath) {
            parts.push(`/${uniqPath}`);
            break;
          }
        }
      }
      return parts.length ? '/' + parts.reverse().join('/') : '';
    }

    getElementDimensions(domElement) {
      const calculatedStyle = window.getComputedStyle(domElement);
      return {
        borderLeft: +calculatedStyle.borderLeftWidth.match(/[0-9]*/)[0],
        borderRight: +calculatedStyle.borderRightWidth.match(/[0-9]*/)[0],
        borderTop: +calculatedStyle.borderTopWidth.match(/[0-9]*/)[0],
        borderBottom: +calculatedStyle.borderBottomWidth.match(/[0-9]*/)[0],
        marginLeft: +calculatedStyle.marginLeft.match(/[0-9]*/)[0],
        marginRight: +calculatedStyle.marginRight.match(/[0-9]*/)[0],
        marginTop: +calculatedStyle.marginTop.match(/[0-9]*/)[0],
        marginBottom: +calculatedStyle.marginBottom.match(/[0-9]*/)[0],
        paddingLeft: +calculatedStyle.paddingLeft.match(/[0-9]*/)[0],
        paddingRight: +calculatedStyle.paddingRight.match(/[0-9]*/)[0],
        paddingTop: +calculatedStyle.paddingTop.match(/[0-9]*/)[0],
        paddingBottom: +calculatedStyle.paddingBottom.match(/[0-9]*/)[0]
      };
    }

    getOwnerWindow(node) {
      if (!node.ownerDocument) { return null; }
      return node.ownerDocument.defaultView;
    }

    getOwnerIframe(node) {
      const nodeWindow = this.getOwnerWindow(node);
      if (nodeWindow) {
        return nodeWindow.frameElement;
      }
      return null;
    }

    getBoundingClientRectWithBorderOffset(node) {
      const dimensions = this.getElementDimensions(node);
      return this.mergeRectOffsets([
        node.getBoundingClientRect(),
        {
          top: dimensions.borderTop,
          left: dimensions.borderLeft,
          bottom: dimensions.borderBottom,
          right: dimensions.borderRight,
          width: 0,
          height: 0
        }
      ]);
    }

    mergeRectOffsets(rects) {
      return rects.reduce((previousRect, rect) => {
        if (previousRect === null) { return rect; }
        return {
          top: previousRect.top + rect.top,
          left: previousRect.left + rect.left,
          width: previousRect.width,
          height: previousRect.height,
          bottom: previousRect.bottom + rect.bottom,
          right: previousRect.right + rect.right
        };
      });
    }

    getNestedBoundingClientRect(node, boundaryWindow) {
      const ownerIframe = this.getOwnerIframe(node);
      if (ownerIframe && ownerIframe !== boundaryWindow) {
        const rects = [node.getBoundingClientRect()];
        let currentIframe = ownerIframe;
        let onlyOneMore = false;
        while (currentIframe) {
          const rect = this.getBoundingClientRectWithBorderOffset(currentIframe);
          rects.push(rect);
          currentIframe = this.getOwnerIframe(currentIframe);
          if (onlyOneMore) { break; }
          if (currentIframe && this.getOwnerWindow(currentIframe) === boundaryWindow) {
            onlyOneMore = true;
          }
        }
        return this.mergeRectOffsets(rects);
      }
      return node.getBoundingClientRect();
    }

    boxWrap(dimensions, parameter, node) {
      Object.assign(node.style, {
        borderTopWidth: dimensions[parameter + 'Top'] + 'px',
        borderLeftWidth: dimensions[parameter + 'Left'] + 'px',
        borderRightWidth: dimensions[parameter + 'Right'] + 'px',
        borderBottomWidth: dimensions[parameter + 'Bottom'] + 'px',
        borderStyle: 'solid'
      });
    }

    warn(msg) {
      if (console.warn) {
        console.warn('[xPath 2]', msg);
      } else {
        console.log('[xPath 2]', msg);
      }
    }

    isBlank(s) {
      return s == null || (typeof s.trim !== 'undefined' && s.trim() === '');
    }

    isSpecialChar(c) {
      const sc = ' \t,:;_=\'"`~!@#$%^&*(){}[]';
      return sc.indexOf(c) >= 0;
    }

    isUniqSelector(sel) {
      try {
        return document.querySelectorAll(sel).length === 1;
      } catch (ex) {
        return false;
      }
    }

    isUniqXPath(xpath) {
      try {
        return this.getElementsByXPath(xpath).length === 1;
      } catch (ex) {
        return false;
      }
    }

    isElementDisabled(element) {
      return element.disabled;
    }

    isElementHidden(element) {
      if (element.offsetParent === null) {
        return true;
      } else {
        let style = window.getComputedStyle(element);
        return style.display === 'none';
      }
    }

    getElementsByXPath(xpath) {
      const results = [];
      const query = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const size = query.snapshotLength;
      for (let i = 0; i < size; ++i) {
        results.push(query.snapshotItem(i));
      }
      return results;
    }

    getValue(element) {
      return typeof element.value === 'undefined' ? '' : element.value;
    }

    getLowerTagName(element) {
      return (element.tagName || '').toLowerCase();
    }

    getLowerType(element) {
      return (element.type || '').toLowerCase();
    }

    getSortedClassList(element) {
      const { classList } = element;
      let sortedList = [];

      if (classList) {
        const size = classList.length;
        for (let i = 0; i < size; i++) {
          sortedList.push(classList[i]);
        }
        sortedList = this.sortByLength(sortedList);
      }
      return sortedList;
    }

    getLongestValue(element) {
      return this.getLongestPartForRobot(this.getValue(element), 1, 80);
    }

    getLongestText(element) {
      const { textContent } = element;
      return this.getLongestPartForRobot(textContent, 3, 80);
    }

    getLongestPartForRobot(st, min, max) {
      const arr = this.splitStrByNewline(st, min, max);
      if (arr.length) {
        const s = arr[arr.length - 1];
        return this.replaceRobotSpecialChars(s);
      } else {
        return '';
      }
    }

    replaceRobotSpecialChars(st) {
      const size = st.length;
      const buf = [];
      let c = null;
      let last = null;

      for (let i = 0; i < size; i++) {
        c = st.charAt(i);
        if (c === '\t') {
          buf.push('${TAB}');
        } else if (c === ' ' && last === ' ') {
          buf.push('${SPACE}');
        } else {
          buf.push(c);
        }
        last = c;
      }
      return buf.join('');
    }

    splitStrByNewline(st, min, max) {
      let arr = [];
      if (st != null) {
        `${st}`.split(/\r?\n/).forEach((s) => {
          s = s.trim();
          if (s.length > max) {
            arr.push(this.substr(s, 0, max));
          } else if (s.length >= min) {
            arr.push(s);
          }
        });
        arr = this.sortByLength(arr);
      }
      return arr;
    }

    substr(st, from, length) {
      const limit = from + length;
      const buf = [];
      let i = from;
      let c = '';

      do {
        buf.push(c);
        c = st.charAt(i++);
      } while (!this.isSpecialChar(c) || i <= limit);
      return buf.join('');
    }

    sortByLength(arr) {
      return arr.sort(function(a, b) {
        return b.length - a.length;
      });
    }

    /**
     * Find unique path to an element by this order: id, name, class
     * @param {DOMElement} element Target element 
     * @param {boolean} isFirst Set true if element is the selected target 
     */
    findUniqPath(element, isFirst) {
      const { id, name, textContent } = element;
      const tagName = this.getLowerTagName(element);
      const value = this.getValue(element);
      let path = null;

      if (!this.isBlank(id) && this.isUniqSelector(`#${id}`)) {
        path = `*[@id="${id}"]`;
      } else if (!this.isBlank(id) && this.isUniqSelector(`${tagName}[id="${id}"]`)) {
        path = `${tagName}[@id="${id}"]`;
      } else if (!this.isBlank(name) && this.isUniqSelector(`${tagName}[name="${name}"]`)) {
        path = `${tagName}[@name="${name}"]`;
      } else if (isFirst) {
        // Detect unique path by text
        const texts = this.splitStrByNewline(textContent, 3, 50);
        if (texts.length) {
          const size = texts.length;
          for (let i = 0; i < size; i++) {
            let v = `*[contains(text(), "${texts[i]}")]`
            if (this.isUniqXPath(`//${v}`)) {
              path = v;
              break;
            }
          }
        }
        // Detect unique path by value
        if (!path && !this.isBlank(value)) {
          const v = `*[@value="${value}"]`
          if (this.isUniqXPath(`//${v}`)) {
            path = v;
          }
        }
        // Detect unique path by CSS class name
        if (!path) {
          const classList = this.getSortedClassList(element);
          const size = classList.length;
          let className;
          for (let i = 0; i < size; i++) {
            className = classList[i];
            if (!this.isBlank(className) &&
              this.isUniqSelector(`${tagName}.${className}`)
            ) {
              path = `${tagName}[contains(@class, "${className}")]`;
              break;
            }
          }
        }
      } else {
        // Detect unique path by short CSS class name
        const classList = this.getSortedClassList(element);
        const size = classList.length;
        let className;
        for (let i = 0; i < size; i++) {
          className = classList[i];
          if (!this.isBlank(className) && className.length <= 20 &&
            this.isUniqSelector(`${tagName}.${className}`)
          ) {
            path = `${tagName}[contains(@class, "${className}")]`;
            break;
          }
        }
      }
      return path;
    }

    createRobotStatusCmds(info, buf) {
      if (info.disabled) {
        buf.push(`element should be disabled  ${info.xpath}`);
      } else {
        buf.push(`element should be enabled  ${info.xpath}`);
      }
      if (info.hidden) {
        buf.push(`element should be not visible  ${info.xpath}`);
      } else {
        buf.push(`element should be visible  ${info.xpath}`);
      }
    }

    createRobotPasswordCmds(info, buf) {
      buf.push(`clear element text  ${info.xpath}`);
      buf.push(`input password  ${info.xpath}  your-test-password`);
      buf.push(`press keys  ${info.xpath}  RETURN`);
    }

    createRobotTextFieldCmds(info, buf) {
      if (this.isBlank(info.value)) {
        buf.push(`clear element text  ${info.xpath}`);
        buf.push(`input text  ${info.xpath}  your-test-value`);
      } else {
        buf.push(`input text  ${info.xpath}  ${info.value}`);
        if (info.tagName === 'input') {
          buf.push(`textfield value should be  ${info.xpath}  ${info.value}`);
          buf.push(`textfield should contain  ${info.xpath}  ${info.value}`);
        } else if (info.tagName === 'textarea') {
          buf.push(`textarea value should be  ${info.xpath}  ${info.value}`);
          buf.push(`textarea should contain  ${info.xpath}  ${info.value}`);
        }
      }
      if (info.tagName === 'input') {
        buf.push(`press keys  ${info.xpath}  RETURN`);
      }
    }

    createRobotTextCmds(info, buf) {
      if (!this.isBlank(info.text) && info.xpath.indexOf(info.text) === -1) {
        buf.push(`element should contain  ${info.xpath}  ${info.text}`);
        buf.push(`element text should be  ${info.xpath}  ${info.text}`);
      }
    }

    /**
     * Forecast some Robot commands for the target element and log them all to Console
     * @param {DOMElement} element Target element 
     * @param {string} xpath XPath to the element 
     */
    forecastRobotCommands(element, xpath) {
      const info = {
        tagName: this.getLowerTagName(element),
        type: this.getLowerType(element),
        disabled: this.isElementDisabled(element),
        hidden: this.isElementHidden(element),
        text: this.getLongestText(element),
        value: this.getLongestValue(element),
        xpath
      };
      const buf = [xpath];

      switch (info.tagName) {
        case 'input':
          let goOn = false;
          switch (info.type) {
            case 'button':
            case 'checkbox':
            case 'radio':
            case 'submit':
              buf.push(`click element  ${info.xpath}`);
              break;
            case 'password':
              this.createRobotPasswordCmds(info, buf);
              break;
            default:
              goOn = true;
          }
          if (!goOn) break;
        case 'select':
        case 'textarea':
          this.createRobotTextFieldCmds(info, buf);
          this.createRobotStatusCmds(info, buf);
          break;
        default:
          buf.push(`click element  ${info.xpath}`);
          buf.push(`double click element  ${info.xpath}`);
          this.createRobotTextCmds(info, buf);
          this.createRobotStatusCmds(info, buf);
          buf.push(`wait until page contains element  ${info.xpath}`);
          if (!this.isBlank(info.text)) {
            buf.push(`wait until page contains  ${info.text}`);
          }
      }

      console.log('[xPath 2] Robot command suggestions:', '\n\t' + buf.join('\n\t'));
    }
  }

  const inspect = new Inspector();

  chrome.runtime.onMessage.addListener(request => {
    if (request.action === 'activate') {
      return inspect.getOptions();
    }
    return inspect.deactivate();
  });

  return true;
})();
