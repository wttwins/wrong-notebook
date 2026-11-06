import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import {
    generateAnalyzePrompt,
    generateReanswerPrompt,
    generateSimilarQuestionPrompt,
} from '@/lib/ai/prompts';

function render(content: string) {
    return renderToStaticMarkup(<MarkdownRenderer content={content} />);
}

describe('math rendering regressions', () => {
    it.each([String.raw`\neq`, String.raw`\nu`, String.raw`\nabla`, String.raw`\notin`])(
        'preserves the LaTeX command %s', (command) => {
            const html = render(`$${command}$`);
            expect(html).toContain(`${command}</annotation>`);
            expect(html).not.toContain('katex-error');
        },
    );

    it.each([
        [String.raw`A \(\frac{1}{2}\) B`, 1],
        [String.raw`\[\int_0^1 x\,dx=\frac{1}{2}\]`, 1],
        [String.raw`$x^2$ and $\sqrt{2}$`, 2],
        [String.raw`$$
\begin{aligned}
a&=1\\
b&=2
\end{aligned}
$$`, 1],
        [String.raw`$$
\begin{pmatrix}1&2\\3&4\end{pmatrix}
$$`, 1],
        [String.raw`$$
f(x)=\begin{cases}x,&x\geq0\\-x,&x<0\end{cases}
$$`, 1],
        [String.raw`| P |
|---|
| $P(A\mid B)$ |`, 1],
    ])('renders a supported formula sample %#', (content, count) => {
        const html = render(content as string);
        expect(html.match(/class="katex"/g)?.length).toBe(count);
        expect(html).not.toContain('katex-error');
    });

    it('does not rewrite formulas inside code', () => {
        const content = '`\\(x\\)`\n\n```latex\n\\[x\\]\n```';
        const html = render(content);
        expect(html).not.toContain('class="katex"');
        expect(html).toContain('\\(x\\)');
        expect(html).toContain('\\[x\\]');
    });
});

describe('math output contract for all AI entry points', () => {
    const prompts = [
        generateAnalyzePrompt('zh'),
        generateSimilarQuestionPrompt('zh', '$x^2=1$', ['equations']),
        generateReanswerPrompt('zh', '$x^2=1$'),
    ];
    it.each(prompts)('requires the same renderable math format %#', (prompt) => {
        expect(prompt).toContain('MATH_RENDERING_CONTRACT');
        expect(prompt).toContain(String.raw`\frac{1}{2}`);
        expect(prompt).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
    });
});
