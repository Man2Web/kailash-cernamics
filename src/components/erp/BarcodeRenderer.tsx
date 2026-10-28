"use client";

import React from "react";

interface BarcodeRendererProps {
  value: string;
  width?: number;
  height?: number;
}

/**
 * A client-side Code-128 (subset B) SVG barcode generator.
 * Converts text values into SVG vector blocks.
 */
export default function BarcodeRenderer({ value, width = 1.5, height = 50 }: BarcodeRendererProps) {
  if (!value) return null;

  // Code-128 Subset B patterns (Start Code B is 104)
  // Mapping index of array corresponds to character ASCII value minus 32
  const PATTERNS: { [key: number]: string } = {
    0: "11011001100", 1: "11001101100", 2: "11001100110", 3: "10010011000", 4: "10010001100",
    5: "10001001100", 6: "10011001000", 7: "10011000100", 8: "10001100100", 9: "11001110100",
    10: "11001011100", 11: "11001001110", 12: "11011100100", 13: "11001110010", 14: "11001110001",
    15: "11011101000", 16: "11011100010", 17: "11011100001", 18: "11000110110", 19: "11000110011",
    20: "11000100111", 21: "11011000110", 22: "11001100010", 23: "11011101110", 24: "11011101000",
    25: "11011100010", 26: "11011100001", 27: "11000110110", 28: "11000110011", 29: "11000100111",
    30: "11011000110", 31: "11001100010", 32: "11011101110", 33: "11101101110", 34: "11010001110",
    35: "11000101110", 36: "11010111000", 37: "11010001110", 38: "11000101110", 39: "11011101000",
    40: "11011100010", 41: "11011100001", 42: "11000110110", 43: "11000110011", 44: "11000100111",
    45: "11011000110", 46: "11001100010", 47: "11011101110", 48: "11101101110", 49: "11010001110",
    50: "11000101110", 51: "11010111000", 52: "11010001110", 53: "11000101110", 54: "11011101000",
    55: "11011100010", 56: "11011100001", 57: "11000110110", 58: "11000110011", 59: "11000100111",
    60: "11011000110", 61: "11001100010", 62: "11011101110", 63: "11101101110", 64: "11010001110",
    65: "11000101110", 66: "11010111000", 67: "11010001110", 68: "11000101110", 69: "11011101000",
    70: "11011100010", 71: "11011100001", 72: "11000110110", 73: "11000110011", 74: "11000100111",
    75: "11011000110", 76: "11001100010", 77: "11011101110", 78: "11101101110", 79: "11010001110",
    80: "11000101110", 81: "11010111000", 82: "11010001110", 83: "11000101110", 84: "11011101000",
    85: "11011100010", 86: "11011100001", 87: "11000110110", 88: "11000110011", 89: "11000100111",
    90: "11011000110", 91: "11001100010", 92: "11011101110", 93: "11101101110", 94: "11010001110",
    95: "11000101110", 96: "11010111000", 97: "11010001110", 98: "11000101110", 99: "11011101000",
    100: "11011100010", 101: "11011100001", 102: "11000110110", 103: "11000110011",
    104: "11010010000", // Start B
    105: "11010011100", // Stop
  };

  // Convert input string to Code-128 bit patterns
  const getBits = () => {
    let bits = "";
    let checksum = 104; // Start B weight is 104
    bits += PATTERNS[104]; // Add Start B pattern

    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i) - 32;
      if (PATTERNS[code]) {
        bits += PATTERNS[code];
        checksum += code * (i + 1);
      }
    }

    const checkDigit = checksum % 103;
    bits += PATTERNS[checkDigit];
    bits += "1100011101011"; // Stop pattern

    return bits;
  };

  const bits = getBits();
  const totalWidth = bits.length * width;

  return (
    <div className="flex flex-col items-center space-y-1 bg-white p-2 border border-slate-100 rounded-sm">
      <svg width={totalWidth} height={height}>
        <g fill="#000000">
          {bits.split("").map((bit, idx) => {
            if (bit === "1") {
              return (
                <rect
                  key={idx}
                  x={idx * width}
                  y={0}
                  width={width}
                  height={height}
                />
              );
            }
            return null;
          })}
        </g>
      </svg>
      <span className="font-mono text-[10px] text-slate-500 font-bold uppercase tracking-widest">
        {value}
      </span>
    </div>
  );
}
