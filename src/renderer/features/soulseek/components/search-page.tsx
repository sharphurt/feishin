import React, { useEffect, useRef, useState } from 'react';

const API_BASE = 'http://localhost:8080/api';

interface DownloadItem {
    averageSpeed: number;
    filename: string;
    id: string;
    percentComplete: number;
    state: string;
    stateDescription: string;
}

interface FileNode {
    bitRate: number;
    filename: string;
    kbps: number;
    size: number;
    username: string;
}

interface SoulseekSearchResult {
    fileNodeDto: FileNode;
    similarityScore: number;
}

interface TrackEntity {
    albumName: string;
    artistName: string;
    genres?: string[];
    imageUrls: string[];
    iTunesId: number;
    title: string;
}

export default function SoulseekDownloader() {
    const [view, setView] = useState<'files' | 'search'>('search');

    const [query, setQuery] = useState('');
    const [tracks, setTracks] = useState<TrackEntity[]>([]);
    const [loadingTracks, setLoadingTracks] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const limit = 20;

    const [selectedTrack, setSelectedTrack] = useState<null | TrackEntity>(null);
    const [fileResults, setFileResults] = useState<SoulseekSearchResult[]>([]);
    const [downloads, setDownloads] = useState<DownloadItem[]>([]);

    const searchPollRef = useRef<NodeJS.Timeout | null>(null);
    const downloadsPollRef = useRef<NodeJS.Timeout | null>(null);

    const handleSearchTrack = async (e: null | React.FormEvent, page = 1) => {
        if (e) e.preventDefault();
        if (!query) return;
        setLoadingTracks(true);

        try {
            const response = await fetch(`${API_BASE}/search/track`, {
                body: JSON.stringify({ limit, page, query, type: 'TRACK' }),
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
            });
            const data = await response.json();

            setTracks(data.entities || []);
            setCurrentPage(data.page);
            setTotalPages(Math.ceil(data.totalResults / data.pageSize));

            if (page === 1) {
                setSelectedTrack(null);
                setFileResults([]);
                setView('search');
            }
        } catch (error) {
            console.error('Ошибка поиска треков:', error);
        } finally {
            setLoadingTracks(false);
        }
    };

    const handleSelectTrack = async (track: TrackEntity) => {
        setSelectedTrack(track);
        setFileResults([]);
        setView('files'); // Переключаем экран вместо роутера

        try {
            await fetch(`${API_BASE}/soulseek/search?trackId=${track.iTunesId}`, {
                method: 'POST',
            });

            if (searchPollRef.current) clearInterval(searchPollRef.current);

            searchPollRef.current = setInterval(async () => {
                const res = await fetch(
                    `${API_BASE}/soulseek/search/results?trackId=${track.iTunesId}`,
                );
                const data = await res.json();
                setFileResults(
                    data.sort((a: any, b: any) => b.similarityScore - a.similarityScore),
                );
            }, 2000);
        } catch (error) {
            console.error('Ошибка поиска файлов:', error);
        }
    };

    const handleDownload = async (fileNode: FileNode) => {
        try {
            await fetch(`${API_BASE}/soulseek/download`, {
                body: JSON.stringify({
                    filename: fileNode.filename,
                    size: fileNode.size,
                    username: fileNode.username,
                }),
                headers: { 'Content-Type': 'application/json' },
                method: 'POST',
            });
        } catch (error) {
            console.error('Ошибка при скачивании:', error);
        }
    };

    useEffect(() => {
        downloadsPollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/soulseek/download/list`);
                const data = await res.json();
                setDownloads(data);
            } catch (error) {
                console.error('Ошибка мониторинга загрузок:', error);
            }
        }, 1000);

        return () => {
            if (searchPollRef.current) clearInterval(searchPollRef.current);
            if (downloadsPollRef.current) clearInterval(downloadsPollRef.current);
        };
    }, []);

    const formatBytes = (bytes: number) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024,
            i = Math.floor(Math.log(bytes) / Math.log(k)),
            sizes = ['B', 'KB', 'MB', 'GB'];
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="w-full text-white p-4">
            {/* ЭКРАН 1: ПОИСК И ВЫДАЧА РЕЗУЛЬТАТОВ */}
            {view === 'search' && (
                <div className="animate-fadeIn">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-slate-200">Soulseek Поиск</h1>
                        {downloads.some((d) => d.percentComplete < 100) && (
                            <span className="text-xs bg-purple-900/50 border border-purple-500 text-purple-300 px-3 py-1 rounded-full animate-pulse">
                                Скачивается треков:{' '}
                                {downloads.filter((d) => d.percentComplete < 100).length}
                            </span>
                        )}
                    </div>

                    <form className="flex gap-2 mb-6" onSubmit={(e) => handleSearchTrack(e, 1)}>
                        <input
                            className="flex-1 p-3 rounded bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 outline-none focus:border-blue-500 text-sm"
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Введите трек или артиста..."
                            value={query}
                        />
                        <button
                            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded font-medium text-sm transition"
                            type="submit"
                        >
                            {loadingTracks ? 'Поиск...' : 'Найти'}
                        </button>
                    </form>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {tracks.map((track) => (
                            <div
                                className="p-3 flex items-center gap-4 bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-750 hover:border-zinc-600 rounded-lg cursor-pointer transition text-left"
                                key={track.iTunesId}
                                onClick={() => handleSelectTrack(track)}
                            >
                                <img
                                    alt="cover"
                                    className="w-14 h-14 rounded object-cover bg-zinc-900"
                                    src={track.imageUrls[0]}
                                />
                                <div className="overflow-hidden flex-1">
                                    <p className="font-semibold text-sm truncate text-zinc-100">
                                        {track.title}
                                    </p>
                                    <p className="text-xs text-zinc-400 truncate mt-0.5">
                                        {track.artistName}
                                    </p>
                                    <p className="text-[11px] text-zinc-500 truncate mt-1">
                                        {track.albumName}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Пагинация */}
                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-4 mt-6">
                            <button
                                className="px-3 py-1.5 bg-zinc-800 text-xs rounded hover:bg-zinc-700 disabled:opacity-40 transition"
                                disabled={currentPage === 1}
                                onClick={() => handleSearchTrack(null, currentPage - 1)}
                            >
                                ← Назад
                            </button>
                            <span className="text-xs text-zinc-400">
                                Стр. {currentPage} из {totalPages}
                            </span>
                            <button
                                className="px-3 py-1.5 bg-zinc-800 text-xs rounded hover:bg-zinc-700 disabled:opacity-40 transition"
                                disabled={currentPage === totalPages}
                                onClick={() => handleSearchTrack(null, currentPage + 1)}
                            >
                                Вперед →
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ЭКРАН 2: ПРЕДЛОЖЕНИЯ К ЗАГРУЗКЕ С ИНЛАЙН-ПРОГРЕССОМ */}
            {view === 'files' && selectedTrack && (
                <div className="animate-fadeIn">
                    <button
                        className="mb-4 text-xs text-zinc-400 hover:text-white transition flex items-center gap-1"
                        onClick={() => {
                            if (searchPollRef.current) clearInterval(searchPollRef.current);
                            setView('search');
                        }}
                    >
                        ← Назад к результатам
                    </button>

                    {/* Хедер трека */}
                    <div className="flex items-center gap-4 mb-6 bg-zinc-800/40 p-4 rounded-lg border border-zinc-800">
                        <img
                            alt="cover"
                            className="w-20 h-20 rounded object-cover shadow"
                            src={selectedTrack.imageUrls[0]}
                        />
                        <div>
                            <h2 className="text-lg font-bold text-zinc-100">
                                {selectedTrack.title}
                            </h2>
                            <p className="text-sm text-zinc-400">{selectedTrack.artistName}</p>
                            <p className="text-xs text-zinc-500 mt-1">{selectedTrack.albumName}</p>
                        </div>
                    </div>

                    <h3 className="text-sm font-semibold mb-3 text-zinc-400">
                        Доступные файлы ({fileResults.length})
                    </h3>

                    <div className="flex flex-col gap-2.5">
                        {fileResults.length === 0 && (
                            <p className="text-xs text-zinc-500">
                                Инициализация поиска Soulseek...
                            </p>
                        )}

                        {fileResults.map((result, idx) => {
                            const file = result.fileNodeDto;
                            // Мапим загрузку по точному имени файла
                            const activeDl = downloads.find((d) => d.filename === file.filename);

                            return (
                                <div
                                    className="p-3 bg-zinc-850 border border-zinc-800 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                    key={idx}
                                >
                                    <div className="overflow-hidden flex-1">
                                        <p
                                            className="text-xs font-mono text-zinc-300 truncate"
                                            title={file.filename}
                                        >
                                            {file.filename.split('\\').pop()}
                                        </p>
                                        <div className="flex gap-3 text-[11px] text-zinc-500 mt-1">
                                            <span>👤 {file.username}</span>
                                            <span>⚖️ {formatBytes(file.size)}</span>
                                            <span className="text-emerald-500 font-medium">
                                                {file.bitRate || Math.round(file.kbps)} kbps
                                            </span>
                                        </div>
                                    </div>

                                    {/* Кнопка действия / Прогресс-бар */}
                                    <div className="min-w-[140px] sm:text-right">
                                        {!activeDl ? (
                                            <button
                                                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-4 py-2 rounded transition"
                                                onClick={() => handleDownload(file)}
                                            >
                                                Скачать
                                            </button>
                                        ) : (
                                            <div className="w-full text-left bg-zinc-900 p-2 rounded border border-zinc-850">
                                                <div className="flex justify-between text-[10px] mb-1">
                                                    <span
                                                        className={
                                                            activeDl.state.includes('Succeeded')
                                                                ? 'text-emerald-400'
                                                                : 'text-blue-400'
                                                        }
                                                    >
                                                        {activeDl.stateDescription ||
                                                            activeDl.state}
                                                    </span>
                                                    <span className="font-mono">
                                                        {activeDl.percentComplete}%
                                                    </span>
                                                </div>
                                                <div className="w-full bg-zinc-800 rounded-full h-1">
                                                    <div
                                                        className={`${activeDl.state.includes('Succeeded') ? 'bg-emerald-500' : 'bg-blue-500'} h-1 rounded-full transition-all duration-300`}
                                                        style={{
                                                            width: `${activeDl.percentComplete}%`,
                                                        }}
                                                    ></div>
                                                </div>
                                                {activeDl.percentComplete < 100 && (
                                                    <div className="text-[9px] text-zinc-500 text-right mt-0.5">
                                                        {formatBytes(activeDl.averageSpeed)}/s
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
