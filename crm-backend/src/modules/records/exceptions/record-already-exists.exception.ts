import { ConflictException } from "@nestjs/common";

export class RecordAlreadyExistsException extends ConflictException {
  constructor(trackNumbers: string[] = []) {
    super(
      trackNumbers.length > 0
        ? `Трек-номера уже выданы в другой выдаче: ${trackNumbers.join(", ")}`
        : "Один из трек-номеров уже выдан в другой выдаче.",
    );
  }
}
