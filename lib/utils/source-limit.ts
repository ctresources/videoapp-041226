/**
 * How much of a source the writer is handed, in characters.
 *
 * A source is whatever the agent brought with them to be written from: a
 * forwarded email, a PDF, a page they linked, text they pasted.
 *
 * It was 12,000, about 2,000 words, on the reasoning that nothing longer would
 * be brought. Then market reports were: they run 4,000 to 5,000 words, and one
 * email carrying two came to nearly 60,000 characters. At 12,000 the writer
 * saw the first two fifths of each and the article was written from the
 * opening pages alone, with nothing to say so.
 *
 * 60,000 is about 10,000 words. The model this goes to reads far more than
 * that, so the number is a ceiling on cost and on a runaway paste, not a
 * limit the writer needs.
 *
 * One number on purpose. The PDF and link readers cut what they return, and
 * the writer cuts what it is given; when those disagreed, the smaller one won
 * silently. They all read this.
 */
export const SOURCE_CHAR_LIMIT = 60000;
