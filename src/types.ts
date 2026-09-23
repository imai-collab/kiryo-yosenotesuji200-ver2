export enum Color {
  Black = 0,
  White = 1,
}

export interface Position {
  x: number;
  y: number;
}

export interface Move {
  from?: Position;
  to: Position;
  piece?: string;
  promote?: boolean;
}

export interface Problem {
  id: number;
  title: string;
  description: string;
  initialSfen: string; // SFEN format for initial board
  solution?: Move[]; // Sequence of correct moves (user, response, user...)
  answerImageUrl?: string; // Answer screenshot as Data URL
}

export interface DataSet {
  id: string;
  title: string;
  appTitle: string;
  clearUrl?: string;
  problems: Problem[];
  timestamp: number;
}
