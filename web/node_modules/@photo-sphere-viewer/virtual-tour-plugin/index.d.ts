import { PanoData, PanoDataProvider, SphereCorrection, ExtendedPosition, Size, Point, TransitionOptions, Position, AbstractConfigurablePlugin, utils, PluginConstructor, Viewer, TypedEvent } from '@photo-sphere-viewer/core';
import { MapHotspot } from '@photo-sphere-viewer/map-plugin';
import { MarkerConfig } from '@photo-sphere-viewer/markers-plugin';
import { PlanHotspot } from '@photo-sphere-viewer/plan-plugin';

/**
 * Definition of GPS coordinates (longitude, latitude, optional altitude)
 */
type GpsPosition = [number, number, number?];
/**
 * Style of the arrow in 3D mode
 */
type VirtualTourArrowStyle = {
    /**
     * URL of an image used for the arrow
     */
    image?: string;
    /**
     * Use a custom element for the arrow
     */
    element?: HTMLElement | ((link: VirtualTourLink) => HTMLElement);
    /**
     * CSS classes added to the element
     */
    className?: string;
    /**
     * Size of the arrow
     */
    size?: Size;
    /**
     * CSS properties to set on the arrow
     */
    style?: Record<string, string>;
};
/**
 * Behaviour of the transition between nodes
 */
type VirtualTourTransitionOptions = {
    /**
     * Show the loader while loading the new panorama
     * @default true
     */
    showLoader?: boolean;
    /**
     * Enable transition between nodes
     * @default 'fade'
     */
    effect?: 'none' | TransitionOptions['effect'];
    /**
     * Speed or duration of the transition between nodes
     * @default '20rpm'
     */
    speed?: string | number;
    /**
     * Enable rotation in the direction of the next node
     * @default true
     */
    rotation?: boolean;
    /**
     * Define where to rotate the current panorama before switching to the next
     * if not defined it will use the link's position
     */
    rotateTo?: Position;
    /**
     * Define the new zoom level
     * if not defined it will keep the current zoom level
     */
    zoomTo?: number;
};
/**
 * Definition of a link between two nodes
 */
type VirtualTourLink = Partial<ExtendedPosition> & {
    /**
     * identifier of the target node
     */
    nodeId: string;
    /**
     * define the position of the link (manual mode)
     */
    position?: ExtendedPosition;
    /**
     * offset added to the final link position in order to move the marker/arrow
     * without affecting where the viewer is rotated before going to the next node
     */
    linkOffset?: {
        yaw?: number;
        pitch?: number;
        depth?: number;
    };
    /**
     * define the GPS position of the node (GPS mode)
     */
    gps?: [number, number, number?];
    /**
     * override global arrow style
     */
    arrowStyle?: VirtualTourArrowStyle;
    /**
     * Any custom data you want to attach to the link
     */
    data?: any;
};
/**
 * Definition of a single node in the tour
 */
type VirtualTourNode = {
    id: string;
    panorama: any;
    /**
     * short name of the node (links tooltip, gallery)
     */
    name?: string;
    /**
     * caption visible in the navbar
     */
    caption?: string;
    /**
     * description visible in the side panel
     */
    description?: string;
    /**
     * data used for this panorama
     */
    panoData?: PanoData | PanoDataProvider;
    /**
     * sphere correction to apply to this panorama
     */
    sphereCorrection?: SphereCorrection;
    /**
     * links to other nodes
     */
    links?: VirtualTourLink[];
    /**
     * GPS position
     */
    gps?: GpsPosition;
    /**
     * display this node in the gallery (if the plugin is loaded)
     * @default true
     */
    showInGallery?: boolean;
    /**
     * thumbnail for the gallery, also use in the tooltip
     */
    thumbnail?: string;
    /**
     * additional markers to use on this node
     */
    markers?: Array<MarkerConfig & {
        gps?: GpsPosition;
    }>;
    /**
     * configuration of the hotspot when using the MapPlugin
     * set to `false` to hide this node from the map
     */
    map?: false | Partial<Point> & Omit<MapHotspot, 'id' | 'yaw' | 'distance'>;
    /**
     * configuration of the hotspot when using the PlanPlugin
     * set to `false` to hide this node from the plan
     */
    plan?: false | Omit<PlanHotspot, 'id' | 'coordinates'>;
    /**
     * Any custom data you want to attach to the node
     */
    data?: any;
};
type VirtualTourPluginConfig = {
    /**
     * configure data mode
     * @default 'client'
     */
    dataMode?: 'client' | 'server';
    /**
     * configure positioning mode
     * @default 'manual'
     */
    positionMode?: 'manual' | 'gps';
    /**
     * configure rendering mode of links
     * @default '3d'
     */
    renderMode?: '3d' | '2d';
    /**
     * initial nodes (client mode)
     */
    nodes?: VirtualTourNode[];
    /**
     * function to fetch a node (server mode)
     */
    getNode?: (nodeId: string) => VirtualTourNode | Promise<VirtualTourNode>;
    /**
     * id of the initial node, if not defined the first node will be used
     */
    startNodeId?: string;
    /**
     * preload linked panoramas
     */
    preload?: boolean | ((node: VirtualTourNode, link: VirtualTourLink) => boolean);
    /**
     * Configuration of the transition between nodes. Can be a callback.
     * @default `{ showLoader: true, speed: '20rpm', effect: 'fade', rotation: true }`
     */
    transitionOptions?: Pick<VirtualTourTransitionOptions, 'showLoader' | 'speed' | 'effect' | 'rotation'> | ((toNode: VirtualTourNode, fromNode?: VirtualTourNode, fromLink?: VirtualTourLink) => VirtualTourTransitionOptions);
    /**
     * if the Compass plugin is enabled, displays the links on the compass
     * @default true
     */
    linksOnCompass?: boolean;
    /**
     * display a tooltip on each link, by default it contains "name" + "thumbnail" + "caption"
     * @default true
     */
    showLinkTooltip?: boolean;
    /**
     * callback to modify the content of the tooltip
     */
    getLinkTooltip?: (content: string, link: VirtualTourLink, node: VirtualTourNode) => string;
    /**
     * global arrow style
     */
    arrowStyle?: VirtualTourArrowStyle;
    /**
     * configuration of the arrows container
     */
    arrowsPosition?: {
        /**
         * (3D mode) Minimal vertical view angle
         * @default 0.3
         */
        minPitch?: number;
        /**
         * (3D mode) Maximal vertical view angle
         * @default PI/2
         */
        maxPitch?: number;
        /**
         * (3D mode) Make transparent links that are close to each other
         * @default PI/4
         */
        linkOverlapAngle?: number;
        /**
         * (2D+GPS mode) vertical offset applied to link markers, to compensate for viewer height
         * @default -0.1
         */
        linkPitchOffset?: number;
    };
    /**
     * special configuration when using the MapPlugin
     */
    map?: {
        /**
         * URL of the map
         */
        imageUrl: string;
        /**
         * size of the map in pixels
         */
        size?: Size;
        /**
         * bounds of the map in GPS coordinates (minX, minY, maxX, maxY)
         */
        extent?: [number, number, number, number];
        /**
         * automatically recenter the map when changing node
         */
        recenter?: boolean;
    };
};

/**
 * Creates virtual tours by linking multiple panoramas
 */
declare class VirtualTourPlugin extends AbstractConfigurablePlugin<VirtualTourPluginConfig, VirtualTourPluginConfig, never, VirtualTourEvents> {
    static readonly id = "virtual-tour";
    static readonly VERSION: string;
    static readonly configParser: utils.ConfigParser<VirtualTourPluginConfig, VirtualTourPluginConfig>;
    static readonly readonlyOptions: string[];
    private readonly state;
    private datasource;
    private arrowsRenderer;
    private map?;
    private plan?;
    private markers?;
    private compass?;
    private gallery?;
    get is3D(): boolean;
    get isServerSide(): boolean;
    get isGps(): boolean;
    static withConfig(config: VirtualTourPluginConfig): [PluginConstructor, any];
    constructor(viewer: Viewer, config: VirtualTourPluginConfig);
    /**
     * Returns the current node
     */
    getCurrentNode(): VirtualTourNode;
    /**
     * Sets the nodes (client mode only)
     * @throws {@link PSVError} if not in client mode
     */
    setNodes(nodes: VirtualTourNode[], startNodeId?: string): void;
    /**
     * Changes the current node
     * @returns {Promise<boolean>} resolves false if the loading was aborted by another call
     */
    setCurrentNode(nodeId: string, options?: VirtualTourTransitionOptions & {
        /**
         * reload the node even if already loaded
         */
        forceUpdate?: boolean;
    }, fromLink?: VirtualTourLink): Promise<boolean>;
    /**
     * Rotate the view to face the link
     */
    gotoLink(nodeId: string, speed?: string | number): Promise<void>;
    /**
     * Returns the position of a link in the viewer
     */
    getLinkPosition(nodeId: string): Position;
    /**
     * Updates a node (client mode only)
     * All properties but "id" are optional, the new config will be merged with the previous
     * @throws {@link PSVError} if not in client mode
     */
    updateNode(newNode: Partial<VirtualTourNode> & {
        id: VirtualTourNode['id'];
    }): void;
    /**
     * Updates the gallery plugin
     */
    private __setGalleryItems;
    /**
     * Update the map plugin
     */
    private __setMapHotspots;
    /**
     * Updates the plan plugin
     */
    private __setPlanHotspots;
    /**
     * Adds the links for the node
     */
    private __renderLinks;
    /**
     * Computes the marker position for a link
     */
    private __getLinkPosition;
    /**
     * Returns the complete tootlip content for a node
     */
    private __getTooltipContent;
    /**
     * Hides the tooltip
     */
    private __hideTooltip;
    /**
     * Manage the preload of the linked panoramas
     */
    private __preload;
    /**
     * Changes the markers to the ones defined on the node
     */
    private __addNodeMarkers;
    /**
     * Gets the position of a node on the map, if applicable
     */
    private __getNodeMapPosition;
    /**
     * Gets a gps position on the map
     */
    private __getGpsMapPosition;
}

/**
 * @event Triggered when the current node changes
 */
declare class NodeChangedEvent extends TypedEvent<VirtualTourPlugin> {
    readonly node: VirtualTourNode;
    readonly data: {
        fromNode: VirtualTourNode;
        fromLink: VirtualTourLink;
        fromLinkPosition: Position;
    };
    static readonly type = "node-changed";
    type: 'node-changed';
}
/**
 * @event Triggered when the user puts the cursor hover a marker
 */
declare class EnterArrowEvent extends TypedEvent<VirtualTourPlugin> {
    readonly link: VirtualTourLink;
    readonly node: VirtualTourNode;
    static readonly type = "enter-arrow";
    type: 'enter-arrow';
}
/**
 * @event Triggered when the user puts the cursor away from an arrow
 */
declare class LeaveArrowEvent extends TypedEvent<VirtualTourPlugin> {
    readonly link: VirtualTourLink;
    readonly node: VirtualTourNode;
    static readonly type = "leave-arrow";
    type: 'leave-arrow';
}
type VirtualTourEvents = NodeChangedEvent | EnterArrowEvent | LeaveArrowEvent;

type events_EnterArrowEvent = EnterArrowEvent;
declare const events_EnterArrowEvent: typeof EnterArrowEvent;
type events_LeaveArrowEvent = LeaveArrowEvent;
declare const events_LeaveArrowEvent: typeof LeaveArrowEvent;
type events_NodeChangedEvent = NodeChangedEvent;
declare const events_NodeChangedEvent: typeof NodeChangedEvent;
type events_VirtualTourEvents = VirtualTourEvents;
declare namespace events {
  export { events_EnterArrowEvent as EnterArrowEvent, events_LeaveArrowEvent as LeaveArrowEvent, events_NodeChangedEvent as NodeChangedEvent, type events_VirtualTourEvents as VirtualTourEvents };
}

export { type GpsPosition, type VirtualTourArrowStyle, type VirtualTourLink, type VirtualTourNode, VirtualTourPlugin, type VirtualTourPluginConfig, type VirtualTourTransitionOptions, events };
