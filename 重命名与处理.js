/**
 * 订阅节点重命名与处理脚本
 * 更新时间：2025-09-28 22:05 +08:00
 * 
 * 功能说明：
 * 对订阅节点进行重命名、过滤、去重、分组、排序等处理
 * 默认不传参数时保持原名称不变，确保兼容性
 * 
 * 基本用法：
 * https://raw.githubusercontent.com/misak10/test/main/test.js#参数
 * 
 * 使用示例：
 * 1. 添加前缀：#name=我的机场
 * 2. 类型小写圆括号：#name=MySub&case=lower&typeFmt=paren
 * 3. 自定义模板：#name=MySub&template=%7Bprefix%7D%20-%20%7Bname%7D%20%7Btype%7D
 * 4. 过滤类型：#onlyTypes=VMESS+VLESS&dedupe=addr
 * 5. 地区国旗：#name=MySub&addFlag=on&locLang=zh
 * 
 * 参数详解：
 * 
 * 【基础格式】
 * name/subName     - 节点前缀名称，不设置则不修改名称
 * abbr             - 类型缩写开关 (on/off，默认on)
 * typeFmt          - 类型格式 (bracket方括号/paren圆括号/none无，默认bracket)
 * case             - 类型大小写 (upper大写/lower小写，默认upper)
 * includeType      - 是否显示类型 (true/false，默认true)
 * pos              - 类型位置 (before前面/after后面，默认before)
 * sep              - 分隔符 (URL编码，默认" - ")
 * template         - 自定义模板 (支持{prefix}{sep}{type}{name}{region})
 * keepUnknownType  - 未知类型处理 (short前2位/full全名/ignore忽略，默认short)
 * map              - 类型映射 (格式：VMESS:V,ANYTLS:A)
 * 
 * 【名称清理】
 * removeEmoji      - 移除表情符号 (true/false，默认false)
 * sanitize         - 替换非法字符为- (true/false，默认false)
 * trimSpaces       - 清理多余空格 (true/false，默认false)
 * maxLen           - 名称最大长度，超出截断 (数字)
 * normalize        - Unicode标准化 (true/false，默认false)
 * cjkSpace         - 中英文间加空格 (true/false，默认false)
 * 
 * 【节点过滤】
 * include          - 包含关键词 (用+分隔，如：HK+SG+JP)
 * exclude          - 排除关键词 (用+分隔)
 * regexInclude     - 包含正则 (URL编码)
 * regexExclude     - 排除正则 (URL编码)
 * onlyTypes        - 仅保留类型 (如：VMESS+VLESS)
 * dropTypes        - 排除类型 (如：HYSTERIA+TUIC)
 * 
 * 【去重排序】
 * dedupe           - 去重方式 (addr地址/name名称/all全部，默认不去重)
 * sortBy           - 排序字段 (name名称/type类型，默认不排序)
 * sortOrder        - 排序方向 (asc升序/desc降序，默认asc)
 * 
 * 【地区国旗】
 * addFlag          - 添加国旗 (true/false，默认false)
 * locLang          - 地区语言 (zh中文/en英文/flag仅国旗，默认zh)
 * regionMap        - 自定义地区 (格式：关键词:显示名:国旗，用+分隔)
 * fallbackFlag     - 未知地区国旗 (URL编码，默认🏴‍☠️)
 * removeRegionName  - 去除原名称中的地区词汇 (true/false，默认false)
 * 
 * 【冲突处理】
 * conflict         - 重名处理 (index编号/hash哈希/drop丢弃，默认index)
 * indexPad         - 编号位数 (默认2位，如01/02)
 * hashLen          - 哈希长度 (默认4位)
 */
function operator(proxies) {
  // ========== 参数解析 ==========
  const args = typeof $arguments !== 'undefined' ? $arguments : {};
  
  // 基础参数
  const subName = args.name ? decodeURI(args.name) : (args.subName ? decodeURI(args.subName) : "");
  
  // ========== 工具函数 ==========
  const parseBool = (v, defaultVal) => {
    if (v === undefined) return defaultVal;
    const s = String(v).toLowerCase();
    return ["1", "true", "on", "yes"].includes(s) ? true : 
           ["0", "false", "off", "no"].includes(s) ? false : defaultVal;
  };
  
  const parseList = (v) => {
    if (!v) return [];
    return decodeURI(String(v)).split(/[+,]/).map(x => x.trim()).filter(Boolean);
  };
  
  const toRegex = (v) => {
    if (!v) return null;
    try { return new RegExp(decodeURI(String(v)), 'i'); } 
    catch { return null; }
  };
  
  const safeStr = (s) => s == null ? '' : String(s);
  
  // 文本处理函数
  const removeEmoji = (s) => s.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "");
  const sanitizeChars = (s) => s.replace(/[\\/:*?"<>|]/g, '-');
  const trimSpaces = (s) => s.replace(/\s{2,}/g, ' ').trim();
  const truncateText = (s, maxLen) => (maxLen && s.length > maxLen) ? s.slice(0, maxLen - 1) + '…' : s;
  const normalizeUnicode = (s) => typeof s.normalize === 'function' ? s.normalize('NFKC') : s;
  
  const addCjkSpaces = (s) => {
    const CJK = /[\u2E80-\u2EFF\u2F00-\u2FDF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;
    let result = '';
    for (let i = 0; i < s.length; i++) {
      const curr = s[i], next = s[i + 1];
      result += curr;
      if (next) {
        const currIsCjk = CJK.test(curr), nextIsCjk = CJK.test(next);
        const currIsAscii = /[A-Za-z0-9]/.test(curr), nextIsAscii = /[A-Za-z0-9]/.test(next);
        if ((currIsCjk && nextIsAscii) || (currIsAscii && nextIsCjk)) {
          if (result[result.length - 1] !== ' ') result += ' ';
        }
      }
    }
    return result;
  };
  
  const generateHash = (str, length = 4) => {
    let hash = 5381;
    const text = safeStr(str);
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) + hash) + text.charCodeAt(i);
    }
    return (hash >>> 0).toString(16).slice(-Math.max(1, length));
  };

  // ========== 配置参数 ==========
  // 格式化参数
  const useAbbr = parseBool(args.abbr, true);
  const typeFmt = (args.typeFmt || "bracket").toString().toLowerCase();
  const typeCase = (args.case || "upper").toString().toLowerCase();
  const sep = args.sep !== undefined ? decodeURI(args.sep) : " - ";
  const includeType = parseBool(args.includeType, true);
  const pos = (args.pos || 'before').toString().toLowerCase();
  const template = args.template ? decodeURI(String(args.template)) : "";
  const keepUnknownType = (args.keepUnknownType || 'short').toString().toLowerCase();

  // 名称处理参数
  const enableRemoveEmoji = parseBool(args.removeEmoji, false);
  const enableTrimSpaces = parseBool(args.trimSpaces, false);
  const enableSanitize = parseBool(args.sanitize, false);
  const maxLen = args.maxLen ? parseInt(args.maxLen, 10) : 0;
  const enableNormalize = parseBool(args.normalize, false);
  const enableCjkSpace = parseBool(args.cjkSpace, false);

  // 过滤参数
  const include = parseList(args.include);
  const exclude = parseList(args.exclude);
  const rxInclude = toRegex(args.regexInclude);
  const rxExclude = toRegex(args.regexExclude);
  const onlyTypes = parseList(args.onlyTypes).map(s => s.toUpperCase());
  const dropTypes = parseList(args.dropTypes).map(s => s.toUpperCase());

  // 去重排序参数
  const dedupe = (args.dedupe || '').toString().toLowerCase();
  const sortBy = (args.sortBy || '').toString().toLowerCase();
  const sortOrder = (args.sortOrder || 'asc').toString().toLowerCase();

  // 地区国旗参数
  const addFlag = parseBool(args.addFlag, false);
  const locLang = (args.locLang || 'zh').toString().toLowerCase();
  const fallbackFlag = args.fallbackFlag ? decodeURI(String(args.fallbackFlag)) : '🏴‍☠️';
  const removeRegionName = parseBool(args.removeRegionName, false);

  // 冲突处理参数
  const conflict = (args.conflict || 'index').toString().toLowerCase();
  const indexPad = args.indexPad ? parseInt(args.indexPad, 10) : 2;
  const hashLen = args.hashLen ? parseInt(args.hashLen, 10) : 4;

  // ========== 类型映射 ==========
  const typeAbbr = {
    'SHADOWSOCKS': 'SS',
    'VMESS': 'VM',
    'TROJAN': 'TR',
    'HYSTERIA': 'HY',
    'HYSTERIA2': 'HY2',
    'VLESS': 'VL',
    'WIREGUARD': 'WG',
    'TUIC': 'TUIC',
    'HTTP': 'HTTP',
    'SOCKS5': 'S5',
    'SNELL': 'SN',
    'ANYTLS': 'AT'
  };

  // 自定义类型映射
  if (args.map) {
    parseList(args.map).forEach(pair => {
      const [k, v] = pair.split(':');
      if (k && v) typeAbbr[k.trim().toUpperCase()] = v.trim();
    });
  }

  // ========== 地区识别 ==========
  const builtInRegions = [
    // 亚洲地区
    { key: /Hong\s?Kong|\bHKG?\b|香港/i, zh: '香港', en: 'Hong Kong', flag: '🇭🇰' },
    { key: /Singapore|\bSGP?\b|新加坡|狮城/i, zh: '新加坡', en: 'Singapore', flag: '🇸🇬' },
    { key: /Japan|\bJPN?\b|日本|Tokyo|东京|大阪|Osaka/i, zh: '日本', en: 'Japan', flag: '🇯🇵' },
    { key: /Korea|\bKOR?\b|韩国|Seoul|首尔/i, zh: '韩国', en: 'Korea', flag: '🇰🇷' },
    { key: /Taiwan|\bTWN?\b|台湾|Taipei|台北/i, zh: '台湾', en: 'Taiwan', flag: '🇹🇼' },
    { key: /\bChina\b|\bCHN?\b|中国|Beijing|上海|深圳|广州/i, zh: '中国', en: 'China', flag: '🇨🇳' },
    { key: /Macao|\bMAC\b|\bMO\b|澳门/i, zh: '澳门', en: 'Macao', flag: '🇲🇴' },
    { key: /Malaysia|\bMYS?\b|马来西亚|Kuala\s?Lumpur/i, zh: '马来西亚', en: 'Malaysia', flag: '🇲🇾' },
    { key: /Thailand|\bTHA?\b|泰国|Bangkok|曼谷/i, zh: '泰国', en: 'Thailand', flag: '🇹🇭' },
    { key: /Vietnam|\bVNM?\b|越南|Ho\s?Chi\s?Minh/i, zh: '越南', en: 'Vietnam', flag: '🇻🇳' },
    { key: /Philippines|\bPHL?\b|菲律宾|Manila/i, zh: '菲律宾', en: 'Philippines', flag: '🇵🇭' },
    { key: /Indonesia|\bIDN?\b|印尼|印度尼西亚|Jakarta/i, zh: '印尼', en: 'Indonesia', flag: '🇮🇩' },
    { key: /\bIndia\b|\bIND?\b|印度|Mumbai|Delhi/i, zh: '印度', en: 'India', flag: '🇮🇳' },
    { key: /\bTurkey\b|\bTUR?\b|土耳其|Istanbul|伊斯坦布尔/i, zh: '土耳其', en: 'Turkey', flag: '🇹🇷' },
    { key: /Israel|\bISR?\b|以色列|Tel\s?Aviv/i, zh: '以色列', en: 'Israel', flag: '🇮🇱' },
    { key: /\bUAE\b|\bARE\b|阿联酋|Dubai|迪拜/i, zh: '阿联酋', en: 'UAE', flag: '🇦🇪' },
    
    // 北美地区
    { key: /United\s?States|\bUSA\b|\bUS\b|美国|Los\s?Angeles|San\s?Jose|New\s?York|Chicago|Miami|Seattle|Dallas/i, zh: '美国', en: 'United States', flag: '🇺🇸' },
    { key: /\bCanada\b|\bCAN?\b|加拿大|Toronto|Vancouver|Montreal/i, zh: '加拿大', en: 'Canada', flag: '🇨🇦' },
    { key: /Mexico|\bMEX?\b|墨西哥|Mexico\s?City/i, zh: '墨西哥', en: 'Mexico', flag: '🇲🇽' },
    
    // 欧洲地区
    { key: /United\s?Kingdom|\bGBR\b|\bUK\b|英国|London|伦敦/i, zh: '英国', en: 'United Kingdom', flag: '🇬🇧' },
    { key: /Germany|\bDEU?\b|德国|Frankfurt|Berlin|法兰克福|柏林/i, zh: '德国', en: 'Germany', flag: '🇩🇪' },
    { key: /\bFrance\b|\bFRA?\b|法国|Paris|巴黎/i, zh: '法国', en: 'France', flag: '🇫🇷' },
    { key: /Netherlands|\bNLD?\b|荷兰|Amsterdam|阿姆斯特丹/i, zh: '荷兰', en: 'Netherlands', flag: '🇳🇱' },
    { key: /Russia|\bRUS?\b|俄罗斯|Moscow|莫斯科/i, zh: '俄罗斯', en: 'Russia', flag: '🇷🇺' },
    { key: /\bItaly\b|\bITA?\b|意大利|Rome|Milan|罗马|米兰/i, zh: '意大利', en: 'Italy', flag: '🇮🇹' },
    { key: /\bSpain\b|\bESP?\b|西班牙|Madrid|Barcelona/i, zh: '西班牙', en: 'Spain', flag: '🇪🇸' },
    { key: /Switzerland|\bCHE?\b|瑞士|Zurich|苏黎世/i, zh: '瑞士', en: 'Switzerland', flag: '🇨🇭' },
    { key: /Sweden|\bSWE?\b|瑞典|Stockholm/i, zh: '瑞典', en: 'Sweden', flag: '🇸🇪' },
    { key: /Norway|\bNOR?\b|挪威|Oslo/i, zh: '挪威', en: 'Norway', flag: '🇳🇴' },
    { key: /Finland|\bFIN?\b|芬兰|Helsinki/i, zh: '芬兰', en: 'Finland', flag: '🇫🇮' },
    { key: /Denmark|\bDNK?\b|丹麦|Copenhagen/i, zh: '丹麦', en: 'Denmark', flag: '🇩🇰' },
    { key: /Poland|\bPOL?\b|波兰|Warsaw/i, zh: '波兰', en: 'Poland', flag: '🇵🇱' },
    { key: /Austria|\bAUT?\b|奥地利|Vienna/i, zh: '奥地利', en: 'Austria', flag: '🇦🇹' },
    { key: /Belgium|\bBEL?\b|比利时|Brussels/i, zh: '比利时', en: 'Belgium', flag: '🇧🇪' },
    { key: /Czech|\bCZE?\b|捷克|Prague/i, zh: '捷克', en: 'Czech Republic', flag: '🇨🇿' },
    { key: /Hungary|\bHUN?\b|匈牙利|Budapest/i, zh: '匈牙利', en: 'Hungary', flag: '🇭🇺' },
    { key: /Romania|\bROU?\b|罗马尼亚|Bucharest/i, zh: '罗马尼亚', en: 'Romania', flag: '🇷🇴' },
    { key: /Bulgaria|\bBGR?\b|保加利亚|Sofia/i, zh: '保加利亚', en: 'Bulgaria', flag: '🇧🇬' },
    { key: /Ukraine|\bUKR?\b|乌克兰|Kiev/i, zh: '乌克兰', en: 'Ukraine', flag: '🇺🇦' },
    { key: /Ireland|\bIRL?\b|爱尔兰|Dublin/i, zh: '爱尔兰', en: 'Ireland', flag: '🇮🇪' },
    { key: /Portugal|\bPRT?\b|葡萄牙|Lisbon/i, zh: '葡萄牙', en: 'Portugal', flag: '🇵🇹' },
    { key: /Greece|\bGRC?\b|希腊|Athens/i, zh: '希腊', en: 'Greece', flag: '🇬🇷' },
    { key: /Iceland|\bISL?\b|冰岛|Reykjavik/i, zh: '冰岛', en: 'Iceland', flag: '🇮🇸' },
    
    // 大洋洲地区
    { key: /Australia|\bAUS?\b|澳大利亚|澳洲|Sydney|Melbourne|悉尼|墨尔本/i, zh: '澳大利亚', en: 'Australia', flag: '🇦🇺' },
    { key: /New\s?Zealand|\bNZL?\b|新西兰|Auckland|Wellington/i, zh: '新西兰', en: 'New Zealand', flag: '🇳🇿' },
    
    // 南美地区
    { key: /Brazil|\bBRA?\b|巴西|Sao\s?Paulo|Rio/i, zh: '巴西', en: 'Brazil', flag: '🇧🇷' },
    { key: /Argentina|\bARG?\b|阿根廷|Buenos\s?Aires/i, zh: '阿根廷', en: 'Argentina', flag: '🇦🇷' },
    { key: /Chile|\bCHL?\b|智利|Santiago/i, zh: '智利', en: 'Chile', flag: '🇨🇱' },
    
    // 非洲地区
    { key: /South\s?Africa|\bZAF?\b|南非|Cape\s?Town|Johannesburg/i, zh: '南非', en: 'South Africa', flag: '🇿🇦' },
    { key: /Egypt|\bEGY?\b|埃及|Cairo/i, zh: '埃及', en: 'Egypt', flag: '🇪🇬' },
    { key: /Nigeria|\bNGA?\b|尼日利亚|Lagos/i, zh: '尼日利亚', en: 'Nigeria', flag: '🇳🇬' }
  ];

  const userRegions = [];
  if (args.regionMap) {
    parseList(args.regionMap).forEach(entry => {
      const parts = entry.split(':');
      if (parts[0]) {
        userRegions.push({
          key: new RegExp(parts[0], 'i'),
          zh: parts[1] || parts[0],
          en: parts[1] || parts[0],
          flag: parts[2] || ''
        });
      }
    });
  }

  // ========== 核心处理函数 ==========
  const detectRegion = (name) => {
    const n = safeStr(name);
    for (const r of userRegions) if (r.key.test(n)) return r;
    for (const r of builtInRegions) if (r.key.test(n)) return r;
    return null;
  };

  const buildRegionStr = (name) => {
    if (!addFlag) return '';
    const region = detectRegion(name);
    const flag = region?.flag || fallbackFlag;
    if (locLang === 'flag') return flag;
    const label = (locLang === 'en') ? (region?.en || '') : (region?.zh || '');
    return label ? `${flag} ${label}` : flag;
  };

  const buildTypeDisplay = (fullType) => {
    const upperType = fullType.toUpperCase();
    let abbr = typeAbbr[upperType];
    
    if (!abbr) {
      if (keepUnknownType === 'ignore') return '';
      abbr = keepUnknownType === 'full' ? upperType : upperType.substring(0, 2);
    }
    
    let label = useAbbr ? abbr : upperType;
    if (typeCase === 'lower') label = label.toLowerCase();
    
    switch (typeFmt) {
      case 'paren': return `(${label})`;
      case 'none': return label;
      default: return `[${label}]`;
    }
  };

  const cleanRegionFromName = (name) => {
    if (!removeRegionName) return name;
    let cleanedName = name;
    
    // 移除用户自定义地区关键词
    for (const r of userRegions) {
      cleanedName = cleanedName.replace(r.key, '').trim();
    }
    
    // 移除内置地区关键词
    for (const r of builtInRegions) {
      cleanedName = cleanedName.replace(r.key, '').trim();
    }
    
    // 移除所有国旗表情符号
    cleanedName = cleanedName.replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu, '').trim();
    
    // 移除其他常见地区相关表情
    cleanedName = cleanedName.replace(/🏴‍☠️|🏳️‍🌈|🏳️‍⚧️|🏴|🏳️/g, '').trim();
    
    // 清理多余空格
    return cleanedName.replace(/\s+/g, ' ').trim();
  };

  const processName = (proxy) => {
    const fullType = safeStr(proxy.type).toUpperCase();
    const typeDisplay = includeType ? buildTypeDisplay(fullType) : '';
    let originalName = safeStr(proxy.name);
    let newName = cleanRegionFromName(originalName);
    const regionStr = buildRegionStr(originalName);

    const shouldFormat = !!subName || !!template || includeType === false || addFlag;
    
    if (shouldFormat) {
      if (template) {
        newName = template
          .replaceAll('{prefix}', subName)
          .replaceAll('{sep}', sep)
          .replaceAll('{type}', typeDisplay)
          .replaceAll('{region}', regionStr)
          .replaceAll('{name}', newName);
      } else if (subName) {
        const parts = [];
        if (regionStr) parts.push(regionStr);
        parts.push(subName);
        if (pos === 'before') {
          if (typeDisplay) parts.push(typeDisplay);
          parts.push(newName);
        } else {
          parts.push(newName);
          if (typeDisplay) parts.push(typeDisplay);
        }
        newName = parts.join(sep);
      }
    }

    // 文本处理
    if (enableRemoveEmoji) newName = removeEmoji(newName);
    if (enableSanitize) newName = sanitizeChars(newName);
    if (enableTrimSpaces) newName = trimSpaces(newName);
    if (enableNormalize) newName = normalizeUnicode(newName);
    if (enableCjkSpace) newName = trimSpaces(addCjkSpaces(newName));
    if (maxLen > 0) newName = truncateText(newName, maxLen);

    return { ...proxy, name: newName };
  };

  // ========== 主处理流程 ==========
  let list = Array.isArray(proxies) ? proxies.slice() : [];
  list = list.filter(p => p && typeof p === 'object');

  // 过滤
  list = list.filter(p => {
    const type = safeStr(p.type).toUpperCase();
    const name = safeStr(p.name);
    
    if (onlyTypes.length && !onlyTypes.includes(type)) return false;
    if (dropTypes.length && dropTypes.includes(type)) return false;
    if (include.length && !include.some(k => name.includes(k))) return false;
    if (exclude.length && exclude.some(k => name.includes(k))) return false;
    if (rxInclude && !rxInclude.test(name)) return false;
    if (rxExclude && rxExclude.test(name)) return false;
    
    return true;
  });

  // 去重
  if (dedupe) {
    const seen = new Set();
    list = list.filter(p => {
      const type = safeStr(p.type).toUpperCase();
      const addr = `${safeStr(p.server)}:${safeStr(p.port)}:${type}`;
      const name = safeStr(p.name);
      
      let key;
      if (dedupe === 'addr') key = `A|${addr}`;
      else if (dedupe === 'name') key = `N|${name}`;
      else if (dedupe === 'all') key = `A|${addr}|N|${name}`;
      else return true;
      
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // 名称处理
  list = list.map(processName);


  // 排序
  if (sortBy) {
    list.sort((a, b) => {
      const av = sortBy === 'type' ? safeStr(a.type).toUpperCase() : safeStr(a.name);
      const bv = sortBy === 'type' ? safeStr(b.type).toUpperCase() : safeStr(b.name);
      const result = av.localeCompare(bv);
      return sortOrder === 'desc' ? -result : result;
    });
  }

  // 冲突处理
  if (conflict !== 'none') {
    const nameCount = new Map();
    list = list.filter(p => {
      const name = safeStr(p.name);
      const count = (nameCount.get(name) || 0) + 1;
      nameCount.set(name, count);
      
      if (count === 1) return true;
      if (conflict === 'drop') return false;
      
      if (conflict === 'hash') {
        const hash = generateHash(`${p.server}:${p.port}:${p.type}:${p.name}`, hashLen);
        p.name = `${name}-${hash}`;
      } else {
        const num = count.toString().padStart(Math.max(2, indexPad), '0');
        p.name = `${name} ${num}`;
      }
      
      return true;
    });
  }

  return list;
}