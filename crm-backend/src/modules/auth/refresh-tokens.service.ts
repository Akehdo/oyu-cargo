import { Injectable } from "@nestjs/common";

import { RedisService } from "../../redis/redis.service";
import { InvalidRefreshTokenException } from "./exceptions/invalid-refresh-token.exception";

const tokenKey = (hash: string) => `auth:refresh:${hash}`;

type StoredSession = { userId: string; sessionVersion: number };

function encode(session: StoredSession): string {
  return `${session.userId}:${session.sessionVersion}`;
}

@Injectable()
export class RefreshTokensService {
  constructor(private readonly redis: RedisService) {}

  async read(hash: string): Promise<StoredSession & { raw: string }> {
    const raw = await this.redis.getClient().get(tokenKey(hash));
    if (!raw) throw new InvalidRefreshTokenException();
    // The original Redis format was just the UUID. It represents version zero.
    const [userId, version = "0"] = raw.split(":");
    return { userId, sessionVersion: Number(version), raw };
  }

  async save(hash: string, session: StoredSession, ttl: number): Promise<void> {
    await this.redis
      .getClient()
      .set(tokenKey(hash), encode(session), "EX", ttl);
  }

  async rotate(
    oldHash: string,
    expected: string,
    newHash: string,
    session: StoredSession,
    ttl: number,
  ): Promise<void> {
    // Consume and replace only once, after the database and signing steps succeed.
    const rotated = await this.redis.getClient().eval(
      `if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
       redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
       redis.call('DEL', KEYS[1])
       return 1`,
      2,
      tokenKey(oldHash),
      tokenKey(newHash),
      expected,
      encode(session),
      ttl,
    );
    if (rotated !== 1) throw new InvalidRefreshTokenException();
  }

  delete(hash: string): Promise<number> {
    return this.redis.getClient().del(tokenKey(hash));
  }
}
