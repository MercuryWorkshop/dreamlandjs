// TODO optimize this
export type SsrSerializedState = string;

export interface SsrData {
	s /* state */ : SsrSerializedState[];
	i /* idents */ : Record<number, string>;
}
