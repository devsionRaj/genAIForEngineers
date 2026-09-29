import * as cheerio from 'cheerio';

export function chunkHtml(html, { chunkSize = 10_000, chunkOverlap = 1_500 } = {}) {
    // Step 1: Parse the HTML and collect complete nodes or recursively split oversized nodes.
    const $ = cheerio.load(html);
    const pieces = [];

    function addNode(node, parentTagPath) {
        const nodeHtml = $.html(node) ?? '';
        const context = `Parent HTML tags: ${parentTagPath.join(' > ') || 'document'}\n`;
        const availableSize = Math.max(1, chunkSize - context.length);

        // Step 1: Keep an element intact when it fits within the available chunk size.
        if (nodeHtml.length <= availableSize) {
            pieces.push({ html: nodeHtml, parentTagPath });
            return;
        }

        // Step 2: Recurse into child nodes when the complete parent element is too large.
        if (node.name && node.children?.length > 0) {
            const childPath = [...parentTagPath, node.name];
            for (const child of node.children) {
                addNode(child, childPath);
            }
            return;
        }

        // Step 3: Split oversized text nodes while preserving their parent-tag path.
        if (node.type === 'text') {
            const characters = Array.from(node.data);
            for (let offset = 0; offset < characters.length; offset += availableSize) {
                pieces.push({
                    html: characters.slice(offset, offset + availableSize).join(''),
                    parentTagPath
                });
            }
            return;
        }

        pieces.push({ html: nodeHtml, parentTagPath });
    }

    for (const node of $.root()[0].children) {
        addNode(node, []);
    }

    // Step 2: Pack nodes into bounded chunks and retain overlap between adjacent chunks.
    const chunks = [];
    let currentPieces = [];
    let currentPath = null;
    let currentLength = 0;

    function flush(nextPiece) {
        if (currentPieces.length === 0) {
            return;
        }

        // Step 1: Emit the current chunk with its parent-tag context.
        const parentTagPath = currentPath;
        const context = `Parent HTML tags: ${parentTagPath.join(' > ') || 'document'}\n`;
        chunks.push({
            pageContent: context + currentPieces.map((piece) => piece.html).join(''),
            parentTagPath
        });

        // Step 2: Retain a bounded suffix as overlap when the next chunk shares this context.
        let overlapPieces = [];
        let overlapLength = 0;
        if (nextPiece && nextPiece.parentTagPath.join(' > ') === parentTagPath.join(' > ')) {
            for (let index = currentPieces.length - 1; index >= 0; index -= 1) {
                const piece = currentPieces[index];
                if (overlapLength + piece.html.length > chunkOverlap) {
                    break;
                }
                overlapPieces.unshift(piece);
                overlapLength += piece.html.length;
            }

            while (
                overlapPieces.length > 0 &&
                context.length + overlapLength + nextPiece.html.length > chunkSize
            ) {
                overlapLength -= overlapPieces.shift().html.length;
            }
        }

        currentPieces = overlapPieces;
        currentPath = currentPieces.length > 0 ? parentTagPath : null;
        currentLength = overlapLength;
    }

    for (const piece of pieces) {
        const pathChanged = currentPieces.length > 0 &&
            piece.parentTagPath.join(' > ') !== currentPath.join(' > ');
        if (pathChanged) {
            flush();
        }

        if (currentPieces.length === 0) {
            currentPath = piece.parentTagPath;
        }

        const context = `Parent HTML tags: ${currentPath.join(' > ') || 'document'}\n`;
        if (
            currentPieces.length > 0 &&
            context.length + currentLength + piece.html.length > chunkSize
        ) {
            flush(piece);
            currentPath = piece.parentTagPath;
        }

        currentPieces.push(piece);
        currentLength += piece.html.length;
    }

    flush();
    return chunks;
}