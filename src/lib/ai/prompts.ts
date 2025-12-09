/**
 * Shared AI prompt templates
 * This module provides centralized prompt management
 */
import { getMathTagsByGrade } from '../knowledge-tags';

/**
 * Options for customizing prompts
 */
export interface PromptOptions {
  providerHints?: string; // Provider-specific instructions
  additionalTags?: {
    subject: string;
    tags: string[];
  }[];
  customTemplate?: string; // Custom template to override default
}

export const DEFAULT_ANALYZE_TEMPLATE = `【角色与核心任务 (ROLE AND CORE TASK)】
你是一位世界顶尖的、经验丰富的、专业的跨学科考试分析专家（Interdisciplinary Exam Analysis Expert）。你的核心任务是极致准确地分析用户提供的考试题目图片，全面理解所有文本、图表和隐含约束，并提供一个完整、高度结构化且专业的 JSON 格式解决方案。

{{language_instruction}}

【核心输出字段要求 (OUTPUT FIELD REQUIREMENTS)】
你的响应输出必须严格为一个有效的 JSON 对象（禁止任何 Markdown 代码块包裹），包含以下五个字段：

1. "questionText": 题目的完整文本。必须使用 Markdown 格式提高可读性。所有数学公式和表达式必须使用 LaTeX 符号（行内：$formula$，块级：$$formula$$）。
2. "answerText": 题目的正确答案。使用 Markdown 和 LaTeX 符号。
3. "analysis": 解决问题的详细步骤解析。
    * 必须使用简体中文。
    * 使用 Markdown 格式（headings, lists, bold, etc.）提高清晰度。
    * 所有数学公式和表达式必须使用 LaTeX 符号。
    * 示例: "求解过程为 $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$"
4. "subject": 题目所属学科。必须严格从以下列表中选取一个："数学", "物理", "化学", "生物", "英语", "语文", "历史", "地理", "政治", "其他"。
5. "knowledgePoints": 知识点数组。必须严格使用下方提供的标准列表中的精确词汇。

【知识点标签列表（KNOWLEDGE POINT LIST）】
{{knowledge_points_list}}

【标签使用规则 (TAG RULES)】
- 标签必须与题目实际考查的知识点精准匹配。
- 每题最多 5 个标签。

【!!! 关键格式与内容约束 (CRITICAL RULES) !!!】
1. 语言一致性（CRITICAL）："questionText" 和 "answerText" 必须使用与原始题目图片完全相同的语言。
2. JSON 纯净性（CRITICAL）：只返回一个有效的 JSON 对象，前后禁止添加任何文本或说明（如 "The final answer is..."）。
3. 格式禁止（CRITICAL）：禁止将 JSON 对象包裹在任何 Markdown 代码块中。
4. 纯文本内容提取 (CRITICAL): 必须只提取图片中**实际的文本和可转换为 LaTeX 的数学内容**。**严格禁止**在任何字段中输出**任何形式的图片引用、链接或视觉描述**，包括但不限于 HTML 的 <img>、Markdown 的 ![alt](url) 格式，或对图表、图形的文字描述（除非该描述本身就是题目文本的一部分）。**若遇无法用 LaTeX 表达的图表，必须用纯文本精确描述其关键特征，绝不能使用图片链接。**
5. 多题处理：如果图片包含多个子问题（如 (1), (2), (3)），请将所有子问题纳入 "questionText" 字段。如果图片包含完全不相关的独立题目，则只专注于提取其中一题。

【预期 JSON 格式 (EXPECTED JSON FORMAT)】
{
"questionText": "题目文本（使用 Markdown 和 LaTeX）",
"answerText": "答案",
"analysis": "详细解析",
"subject": "数学",
"knowledgePoints": ["知识点1", "知识点2"]
}

{{provider_hints}}`;

export const DEFAULT_SIMILAR_TEMPLATE = `You are an expert AI tutor creating practice problems for middle school students.
Create a NEW practice problem based on the following original question and knowledge points.

DIFFICULTY LEVEL: {{difficulty_level}}
{{difficulty_instruction}}

{{language_instruction}}

Original Question: "{{original_question}}"
Knowledge Points: {{knowledge_points}}

【核心输出字段要求 (OUTPUT FIELD REQUIREMENTS)】
你的响应输出必须严格为一个有效的 JSON 对象（禁止任何 Markdown 代码块包裹），包含以下五个字段:
1. "questionText": 题目的完整文本。必须使用 Markdown 格式提高可读性。所有数学公式和表达式必须使用 LaTeX 符号（行内：$formula$，块级：$$formula$$）。
2. "answerText": 题目的正确答案。使用 Markdown 和 LaTeX 符号。
3. "analysis": 解决问题的详细步骤解析。
    * 必须使用简体中文。
    * 使用 Markdown 格式（headings, lists, bold, etc.）提高清晰度。
    * 所有数学公式和表达式必须使用 LaTeX 符号。
    * 示例: "求解过程为 $x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$"
4. "subject": 题目所属学科。必须严格从以下列表中选取一个："数学", "物理", "化学", "生物", "英语", "语文", "历史", "地理", "政治", "其他"。
5. "knowledgePoints": 知识点数组。必须严格使用下方提供的标准列表中的精确词汇。


【!!! 关键格式与内容约束 (CRITICAL RULES) !!!】
1. 语言一致性（CRITICAL）："questionText" 和 "answerText" 必须使用与原始题目图片完全相同的语言。
2. JSON 纯净性（CRITICAL）：只返回一个有效的 JSON 对象，前后禁止添加任何文本或说明（如 "The final answer is..."）。
3. 格式禁止（CRITICAL）：禁止将 JSON 对象包裹在任何 Markdown 代码块中。
4. 纯文本内容提取 (CRITICAL): 必须只提取图片中**实际的文本和可转换为 LaTeX 的数学内容**。**严格禁止**在任何字段中输出**任何形式的图片引用、链接或视觉描述**，包括但不限于 HTML 的 <img>、Markdown 的 ![alt](url) 格式，或对图表、图形的文字描述（除非该描述本身就是题目文本的一部分）。**若遇无法用 LaTeX 表达的图表，必须用纯文本精确描述其关键特征，绝不能使用图片链接。**
5. 多题处理：如果图片包含多个子问题（如 (1), (2), (3)），请将所有子问题纳入 "questionText" 字段。如果图片包含完全不相关的独立题目，则只专注于提取其中一题。


**Expected JSON Format:**
{
  "questionText": "新问题的文本（如果是选择题，包含选项 A、B、C、D）",
  "answerText": "正确答案",
  "analysis": "详细解析",
  "subject": "数学",
  "knowledgePoints": ["知识点1", "知识点2"]
}

{{provider_hints}}`;

/**
 * Helper to replace placeholders in template
 */
function replaceVariables(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] || "";
  });
}

/**
 * 获取指定年级的累进数学标签
 * 初一：只包含七年级标签
 * 初二：包含七年级+八年级标签
 * 初三：包含七年级+八年级+九年级标签
 * @param grade - 年级 (7, 8, 9) 或 null
 * @returns 标签数组
 */
export function getMathTagsForGrade(grade: 7 | 8 | 9 | null): string[] {
  if (!grade) {
    // 如果没有年级信息，返回所有年级的标签
    return [
      ...getMathTagsByGrade(7),
      ...getMathTagsByGrade(8),
      ...getMathTagsByGrade(9)
    ];
  }

  // 累进式标签：当前年级及之前所有年级
  const tags: string[] = [];
  if (grade >= 7) tags.push(...getMathTagsByGrade(7));
  if (grade >= 8) tags.push(...getMathTagsByGrade(8));
  if (grade >= 9) tags.push(...getMathTagsByGrade(9));

  return tags;
}

/**
 * Generates the analyze image prompt
 * @param language - Target language for analysis ('zh' or 'en')
 * @param grade - Optional grade level (7, 8, 9) for cumulative tag filtering
 * @param options - Optional customizations
 */
export function generateAnalyzePrompt(
  language: 'zh' | 'en',
  grade?: 7 | 8 | 9 | null,
  subject?: string | null,
  options?: PromptOptions
): string {
  const langInstruction = language === 'zh'
    ? "IMPORTANT: For the 'analysis' field, use Simplified Chinese. For 'questionText' and 'answerText', YOU MUST USE THE SAME LANGUAGE AS THE ORIGINAL QUESTION. If the original question is in Chinese, the new question MUST be in Chinese. If the original is in English, keep it in English. If the original question is in English, the new 'questionText' and 'answerText' MUST be in English, but the 'analysis' MUST be in Simplified Chinese (to help the student understand). "
    : "Please ensure all text fields are in English.";

  // 获取数学标签（根据年级累进）
  const mathTags = getMathTagsForGrade(grade || null);
  const mathTagsString = mathTags.map(tag => `"${tag}"`).join(", ");

  // 根据科目决定显示哪些标签（节省 token，提高准确性）
  let tagsSection = "";

  if (subject === '数学') {
    tagsSection = `**数学标签 (Math Tags):**
使用人教版课程大纲中的**精确标签名称**，可选标签如下：
${mathTagsString}

**重要提示**：
- 必须从上述列表中选择精确匹配的标签
- 每题最多 5 个标签`;
  } else if (subject === '物理') {
    tagsSection = `**物理标签 (Physics Tags):**
"力学", "电学", "光学", "热学", "声学", "磁学", "欧姆定律", "浮力", "压强", "功和能", "杠杆原理", "滑轮", "电功率", "串并联电路", "电磁感应", "凸透镜成像", "光的反射", "光的折射", "机械运动", "牛顿定律"`;
  } else if (subject === '化学') {
    tagsSection = `**化学标签 (Chemistry Tags):**
"化学方程式", "氧化还原反应", "酸碱盐", "有机化学", "无机化学", "元素周期表", "化学键", "溶液", "溶解度", "酸碱中和", "金属活动性", "燃烧", "化学计算", "气体制备", "物质分类"`;
  } else if (subject === '英语') {
    tagsSection = `**英语标签 (English Tags):**
"语法", "词汇", "阅读理解", "完形填空", "写作", "听力", "翻译", "时态", "从句", "冠词", "介词", "动词短语", "固定搭配"`;
  } else {
    // 未知科目：显示所有标签让 AI 判断
    tagsSection = `**数学标签 (Math Tags):**
${mathTagsString}

**物理标签 (Physics Tags):**
"力学", "电学", "光学", "热学", "欧姆定律", "浮力", "压强", "功和能"

**化学标签 (Chemistry Tags):**
"化学方程式", "氧化还原反应", "酸碱盐", "有机化学", "无机化学"

**英语标签 (English Tags):**
"语法", "词汇", "阅读理解", "完形填空", "写作", "听力", "翻译"`;
  }

  const template = options?.customTemplate || DEFAULT_ANALYZE_TEMPLATE;

  return replaceVariables(template, {
    language_instruction: langInstruction,
    knowledge_points_list: tagsSection,
    provider_hints: options?.providerHints || ''
  }).trim();
}

/**
 * Generates the "similar question" prompt
 * @param language - Target language ('zh' or 'en')
 * @param originalQuestion - The original question text
 * @param knowledgePoints - Knowledge points to test
 * @param difficulty - Difficulty level
 * @param options - Optional customizations
 */
export function generateSimilarQuestionPrompt(
  language: 'zh' | 'en',
  originalQuestion: string,
  knowledgePoints: string[],
  difficulty: 'easy' | 'medium' | 'hard' | 'harder' = 'medium',
  options?: PromptOptions
): string {
  const langInstruction = language === 'zh'
    ? "IMPORTANT: Provide the output based on the 'Original Question' language. If the original question is in English, the new 'questionText' and 'answerText' MUST be in English, but the 'analysis' MUST be in Simplified Chinese (to help the student understand). If the original is in Chinese, everything MUST be in Simplified Chinese."
    : "Please ensure the generated question is in English.";

  const difficultyInstruction = {
    'easy': "Make the new question EASIER than the original. Use simpler numbers and more direct concepts.",
    'medium': "Keep the difficulty SIMILAR to the original question.",
    'hard': "Make the new question HARDER than the original. Combine multiple concepts or use more complex numbers.",
    'harder': "Make the new question MUCH HARDER (Challenge Level). Require deeper understanding and multi-step reasoning."
  }[difficulty];

  const template = options?.customTemplate || DEFAULT_SIMILAR_TEMPLATE;

  return replaceVariables(template, {
    difficulty_level: difficulty.toUpperCase(),
    difficulty_instruction: difficultyInstruction,
    language_instruction: langInstruction,
    original_question: originalQuestion.replace(/"/g, '\\"').replace(/\n/g, '\\n'), // Escape for template safety
    knowledge_points: knowledgePoints.join(", "),
    provider_hints: options?.providerHints || ''
  }).trim();
}
