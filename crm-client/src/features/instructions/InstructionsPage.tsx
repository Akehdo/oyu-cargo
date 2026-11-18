import { CirclePlay, ExternalLink, MessageCircle } from "lucide-react";
import { support, textInstructions, youtube } from "../../config/content";

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

export function InstructionsPage(): JSX.Element {
  const videos = youtube.videos.map((video) => ({
    ...video,
    youtubeId: video.youtubeId.trim(),
  }));
  const hasAnyVideo = videos.some((video) => YOUTUBE_ID_PATTERN.test(video.youtubeId));

  return (
    <div className="page instructions-page">
      <section className="hero-card instructions-hero">
        <CirclePlay size={32} />
        <div>
          <h2>Видеоинструкции</h2>
          <p>Как заказывать из Китая и пользоваться кабинетом.</p>
        </div>
        {youtube.channelUrl ? (
          <a
            className="secondary-button on-brand"
            href={youtube.channelUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={18} />
            Наш YouTube-канал
          </a>
        ) : null}
      </section>

      <div className="video-list">
        {videos.map((video) => (
          <article
            className={`card video-card ${YOUTUBE_ID_PATTERN.test(video.youtubeId) ? "" : "is-pending"}`}
            key={video.title}
          >
            {YOUTUBE_ID_PATTERN.test(video.youtubeId) ? (
              <div className="video-frame">
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}`}
                  title={video.title}
                  loading="lazy"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            ) : (
              <div className="video-placeholder" aria-hidden="true">
                <CirclePlay size={24} />
              </div>
            )}
            <div className="video-text">
              <h3>{video.title}</h3>
              {video.description ? <p className="muted">{video.description}</p> : null}
              {!YOUTUBE_ID_PATTERN.test(video.youtubeId) ? (
                <span className="muted small">Видео скоро появится</span>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      {!hasAnyVideo ? (
        <section className="card">
          <div className="card-title">
            <h2>Как начать — коротко</h2>
          </div>
          <div className="text-instructions">
            {textInstructions.map((block) => (
              <div key={block.title}>
                <h3>{block.title}</h3>
                <ul>
                  {block.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <a
        className="secondary-button wide"
        href={support.whatsappUrl}
        target="_blank"
        rel="noreferrer"
      >
        <MessageCircle size={18} />
        Остались вопросы? Напишите в WhatsApp
      </a>
    </div>
  );
}
