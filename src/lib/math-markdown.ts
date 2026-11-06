/** Normalize legacy delimiters without modifying LaTeX commands or code. */
export function normalizeMathMarkdown(content: string): string {
    return content.replace(
        /(^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\2[ \t]*$|(`+)[\s\S]*?\3|\$\$[\s\S]*?\$\$|\$(?:\\.|[^$\\\n])+\$)|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/gm,
        (match, protectedContent, _fence, _inlineCode, displayMath, inlineMath) => {
            if (protectedContent) return match;
            if (displayMath !== undefined) return `\n\n$$\n${displayMath.trim()}\n$$\n\n`;
            return `$${inlineMath.trim()}$`;
        },
    );
}
