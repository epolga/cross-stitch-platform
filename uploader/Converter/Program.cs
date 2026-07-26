using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace Converter
{
    internal static class Program
    {
        // 1
        private const string ReplaceStitchCraftTokenFrom = "(StitchCraft)";
        private const string ReplaceStitchCraftTokenTo = "(cross-stitch.com)";

        // 3
        private const string DesignedLine =
            "This kit was designed and created on StitchCraft software";

        // 4
        private const string OldBottomLine1 =
            "0.0035  Tc 0  Tw (http://www.stitchcraft.info) Tj";
        private const string OldBottomLine2 =
            "https://www.cross-stitch-pattern.net      ";
        private const string OldBottomLine3 =
            "http://www.cross-stitch-pattern.net      ";
        private const string NewBottomLine1 =
            "0.0035  Tc 0  Tw (https://cross-stitch.com) Tj";
        private const string NewBottomLine2 =
            "         https://cross-stitch.com";
        private const string NewBottomLine3 =
            "         https://cross-stitch.com";

        // 5
        private const string OldRect = "190.8 50.73 213.72 0.96 re f";
        private const string NewRect = "190.8 50.73 187.72 0.96 re f";

        // 6
        private const string OldDocName = "Microsoft Word - StitchCraft PDF Last Page.doc";
        private const string NewDocName = "Microsoft Word - cross-stitch.com PDF Last Page.doc";

        // 2
        private static readonly Regex CountRegex = new(@"/Count\s+(\d+)", RegexOptions.Compiled);

        // 7 helpers
        private static readonly Regex ObjStartRegex = new(@"(?m)^\s*(\d+)\s+(\d+)\s+obj\s*$", RegexOptions.Compiled);
        private static readonly Regex TrailerRegex = new(@"(?s)trailer\s*<<(.*?)>>", RegexOptions.Compiled);
        private static readonly Regex StartXrefRegex = new(@"(?m)^\s*startxref\s*$", RegexOptions.Compiled);

        //8
        const string stitchCraftUrl1 = "http://www.stitchcraft.info";
        const string stitchCraftUrl2 = "https://www.stitchcraft.info";
        const string newUrl = "https://cross-stitch.com";
        static int Main(string[] args)
        {
            if (args.Length < 1)
            {
                Console.Error.WriteLine("Usage: Converter <input.pdf> [output.pdf]");
                return 2;
            }

            var inputPath = args[0];
            if (!File.Exists(inputPath))
            {
                Console.Error.WriteLine($"File not found: {inputPath}");
                return 2;
            }

            var outputPath = args.Length > 1
                ? args[1]
                : System.IO.Path.Combine(
                    System.IO.Path.GetDirectoryName(inputPath)!,
                    System.IO.Path.GetFileNameWithoutExtension(inputPath) + ".converted.pdf"
                );

            try
            {
                ConvertPdfTextually(inputPath, outputPath);
                Console.WriteLine($"Created: {outputPath}");
                return 0;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine("ERROR:");
                Console.Error.WriteLine(ex);
                return 1;
            }
        }

        private static void ConvertPdfTextually(string inputPath, string outputPath)
        {
            // IMPORTANT: Use Latin-1 so bytes map 1:1 to chars (no data loss).
            // This is critical for rebuilding offsets correctly later.
            byte[] bytes = File.ReadAllBytes(inputPath);
            string pdf = Encoding.Latin1.GetString(bytes);

            // Safety checks: xref-stream PDFs are not supported by this text approach.
            if (pdf.Contains("/Type/XRef", StringComparison.Ordinal) || pdf.Contains("/XRefStm", StringComparison.Ordinal))
                throw new NotSupportedException("This PDF appears to use xref streams (/Type/XRef or /XRefStm). Text-based editing is not supported.");

            // ---------- Steps 1,3,4,5,6 ----------
            pdf = pdf.Replace(ReplaceStitchCraftTokenFrom, ReplaceStitchCraftTokenTo, StringComparison.Ordinal);

            // Step 3: replace the sentence with same number of spaces (keep length)
            // Note: This assumes that exact string appears literally in a stream.
            pdf = ReplaceWithSameLengthSpaces(pdf, DesignedLine);

            // Step 4
            pdf = pdf.Replace(OldBottomLine1, NewBottomLine1, StringComparison.Ordinal);
            pdf = pdf.Replace(OldBottomLine2, NewBottomLine2, StringComparison.Ordinal);
            pdf = pdf.Replace(OldBottomLine3, NewBottomLine3, StringComparison.Ordinal);

            // Step 5
            pdf = pdf.Replace(OldRect, NewRect, StringComparison.Ordinal);

            // Step 6
            pdf = pdf.Replace(OldDocName, NewDocName, StringComparison.Ordinal);

            // Step 2: replace FIRST /Count <number> with number-1
            pdf = DecrementFirstCount(pdf);

            // ---------- Step 7: delete last page object containing last "/Type /Page" ----------
            pdf = DeleteLastPageObject(pdf, out int removedObjNumber, out int removedObjGen);

            // ------------ Step 8: replace StitchCraft ----------
            pdf = pdf.Replace(stitchCraftUrl1, newUrl, StringComparison.Ordinal);
            pdf = pdf.Replace(stitchCraftUrl2, newUrl, StringComparison.Ordinal);

            // After deleting bytes, the existing xref is invalid.
            // Rebuild a classic xref table + trailer + startxref from scratch.
            pdf = RebuildXrefAndTrailer(pdf);

            // Write back (Latin-1 => bytes preserved)
            File.WriteAllBytes(outputPath, Encoding.Latin1.GetBytes(pdf));
        }

        private static string ReplaceWithSameLengthSpaces(string text, string target)
        {
            int idx = 0;
            while (true)
            {
                int pos = text.IndexOf(target, idx, StringComparison.Ordinal);
                if (pos < 0) break;

                string spaces = new string(' ', target.Length);
                text = text.Substring(0, pos) + spaces + text.Substring(pos + target.Length);
                idx = pos + spaces.Length;
            }
            return text;
        }

        private static string DecrementFirstCount(string pdf)
        {
            var m = CountRegex.Match(pdf);
            if (!m.Success) return pdf;

            int n = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
            if (n <= 0) return pdf;

            int newN = n - 1;
            // Replace only the number part of the first match
            int numberStart = m.Groups[1].Index;
            int numberLen = m.Groups[1].Length;

            return pdf.Substring(0, numberStart) + newN.ToString(CultureInfo.InvariantCulture) + pdf.Substring(numberStart + numberLen);
        }

        private static string DeleteLastPageObject(string pdf, out int objNum, out int objGen)
        {
            objNum = -1;
            objGen = -1;

            int typePagePos = pdf.LastIndexOf("/Type /Page", StringComparison.Ordinal);
            if (typePagePos < 0)
                throw new InvalidOperationException("Could not find '/Type /Page' in the PDF.");

            // Find the enclosing "n g obj" start ABOVE that position
            var starts = ObjStartRegex.Matches(pdf);
            if (starts.Count == 0)
                throw new InvalidOperationException("No 'obj' markers found.");

            Match? chosen = null;
            foreach (Match s in starts)
            {
                if (s.Index < typePagePos)
                    chosen = s;
                else
                    break;
            }

            if (chosen == null)
                throw new InvalidOperationException("Could not locate the object start for the last page.");

            objNum = int.Parse(chosen.Groups[1].Value, CultureInfo.InvariantCulture);
            objGen = int.Parse(chosen.Groups[2].Value, CultureInfo.InvariantCulture);

            int objStart = chosen.Index;

            // Find the corresponding endobj after the /Type /Page
            int endObjPos = pdf.IndexOf("endobj", typePagePos, StringComparison.Ordinal);
            if (endObjPos < 0)
                throw new InvalidOperationException("Could not find 'endobj' for the last page object.");

            // Include the full 'endobj' line (and a trailing newline if present)
            int end = endObjPos + "endobj".Length;
            if (end < pdf.Length && (pdf[end] == '\r' || pdf[end] == '\n'))
            {
                // consume one newline sequence
                if (pdf[end] == '\r' && end + 1 < pdf.Length && pdf[end + 1] == '\n')
                    end += 2;
                else
                    end += 1;
            }

            return pdf.Remove(objStart, end - objStart);
        }

        private static string RebuildXrefAndTrailer(string pdf)
        {
            // Remove everything from the last "xref" onward, because we will replace it.
            int lastXrefPos = pdf.LastIndexOf("\nxref", StringComparison.Ordinal);
            if (lastXrefPos < 0)
                lastXrefPos = pdf.LastIndexOf("\rxref", StringComparison.Ordinal);
            if (lastXrefPos < 0)
                lastXrefPos = pdf.LastIndexOf("xref", StringComparison.Ordinal);

            if (lastXrefPos < 0)
                throw new InvalidOperationException("Could not find 'xref'. This text-based converter requires classic xref tables.");

            string body = pdf.Substring(0, lastXrefPos);

            // Find the last trailer dictionary in the original PDF (before we truncated),
            // so we keep /Root, /Info, /ID, etc.
            var trailerMatch = TrailerRegex.Matches(pdf).Cast<Match>().LastOrDefault();
            if (trailerMatch == null || !trailerMatch.Success)
                throw new InvalidOperationException("Could not find 'trailer <<...>>'.");

            string trailerDictInner = trailerMatch.Groups[1].Value;

            // We'll update /Size to match rebuilt xref size.
            // (Keep other entries unchanged.)
            trailerDictInner = Regex.Replace(
                trailerDictInner,
                @"(?m)/Size\s+\d+",
                "/Size __SIZE__",
                RegexOptions.Compiled
            );

            // Scan object positions in the (possibly modified) body
            var objects = new List<(int objNum, int gen, int offset)>();
            foreach (Match m in ObjStartRegex.Matches(body))
            {
                int n = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
                int g = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
                int off = m.Index; // byte offset == char offset in Latin1
                objects.Add((n, g, off));
            }

            if (objects.Count == 0)
                throw new InvalidOperationException("No objects found to build xref.");

            int maxObj = objects.Max(o => o.objNum);
            int size = maxObj + 1;

            // Build xref entries; default missing objects to free
            var xrefEntries = new (int offset, int gen, char inUse)[size];
            xrefEntries[0] = (0, 65535, 'f');

            for (int i = 1; i < size; i++)
                xrefEntries[i] = (0, 0, 'f');

            foreach (var o in objects)
            {
                if (o.objNum >= 0 && o.objNum < size)
                    xrefEntries[o.objNum] = (o.offset, o.gen, 'n');
            }

            // Compose xref table (single subsection 0..maxObj)
            var sb = new StringBuilder(body.Length + 2000);
            sb.Append(body);

            // Ensure body ends with newline
            if (sb.Length > 0 && sb[sb.Length - 1] != '\n' && sb[sb.Length - 1] != '\r')
                sb.Append('\n');

            int xrefOffset = sb.Length; // startxref points here

            sb.Append("xref\n");
            sb.Append("0 ").Append(size.ToString(CultureInfo.InvariantCulture)).Append('\n');

            for (int i = 0; i < size; i++)
            {
                sb.Append(xrefEntries[i].offset.ToString("D10", CultureInfo.InvariantCulture))
                  .Append(' ')
                  .Append(xrefEntries[i].gen.ToString("D5", CultureInfo.InvariantCulture))
                  .Append(' ')
                  .Append(xrefEntries[i].inUse)
                  .Append(" \n");
            }

            string trailerDict = trailerDictInner.Replace("/Size __SIZE__", "/Size " + size.ToString(CultureInfo.InvariantCulture), StringComparison.Ordinal);

            sb.Append("trailer\n");
            sb.Append("<<").Append(trailerDict).Append(">>\n");
            sb.Append("startxref\n");
            sb.Append(xrefOffset.ToString(CultureInfo.InvariantCulture)).Append('\n');
            sb.Append("%%EOF\n");

            return sb.ToString();
        }
    }

    internal static class StringExtensions
    {
        public static string Replace(this string s, string oldValue, string newValue, StringComparison comparison)
        {
            if (string.IsNullOrEmpty(oldValue)) return s;
            int start = 0;
            while (true)
            {
                int idx = s.IndexOf(oldValue, start, comparison);
                if (idx < 0) break;
                s = s.Substring(0, idx) + newValue + s.Substring(idx + oldValue.Length);
                start = idx + newValue.Length;
            }
            return s;
        }
    }
}
